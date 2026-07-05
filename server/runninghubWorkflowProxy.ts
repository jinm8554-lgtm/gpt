import type { Express, Request, Response as ExpressResponse } from "express";
import express from "express";

const DEFAULT_WORKFLOW_ID = "2050306122774532097";
const DEFAULT_RUNNINGHUB_API_BASE = "https://runninghub.cn/openapi/v2";

const TERMINAL_STATUSES = new Set(["SUCCESS", "FAILED", "CANCELED", "CANCELLED"]);

type RunningHubResult = {
  url?: string;
  nodeId?: string;
  outputType?: string;
  text?: string | null;
};

type RunningHubTaskResponse = {
  taskId?: string;
  status?: string;
  errorCode?: string;
  errorMessage?: string;
  failedReason?: unknown;
  usage?: unknown;
  results?: RunningHubResult[] | null;
  clientId?: string;
  promptTips?: string;
};

class RunningHubHttpError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, message: string, detail: unknown) {
    super(message);
    this.name = "RunningHubHttpError";
    this.status = status;
    this.detail = detail;
  }
}

function getRunningHubApiKey() {
  return process.env.RUNNINGHUB_API_KEY || process.env.RH_API_KEY || "";
}

function getRunningHubApiBase() {
  return (process.env.RUNNINGHUB_API_BASE || DEFAULT_RUNNINGHUB_API_BASE).replace(/\/+$/, "");
}

function getRunningHubWorkflowId() {
  return process.env.RUNNINGHUB_WORKFLOW_ID || DEFAULT_WORKFLOW_ID;
}

async function readResponseBody(response: globalThis.Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function runningHubJsonRequest<T>(path: string, body: unknown): Promise<T> {
  const apiKey = getRunningHubApiKey();
  if (!apiKey) {
    throw new RunningHubHttpError(
      500,
      "RUNNINGHUB_API_KEY is not configured on the server.",
      null
    );
  }

  const response = await fetch(`${getRunningHubApiBase()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });

  const data = await readResponseBody(response);

  if (!response.ok) {
    throw new RunningHubHttpError(
      response.status,
      `RunningHub API request failed with HTTP ${response.status}`,
      data
    );
  }

  return data as T;
}

async function uploadBinaryToRunningHub(buffer: Buffer, fileName: string, mimeType: string) {
  const apiKey = getRunningHubApiKey();
  if (!apiKey) {
    throw new RunningHubHttpError(
      500,
      "RUNNINGHUB_API_KEY is not configured on the server.",
      null
    );
  }

  if (!buffer.length) {
    throw new RunningHubHttpError(400, "Upload file body is empty.", null);
  }

  const form = new FormData();
  const safeFileName = fileName || `upload-${Date.now()}`;
  const fileBlob = new Blob([new Uint8Array(buffer)], {
    type: mimeType || "application/octet-stream",
  });

  form.append("file", fileBlob, safeFileName);

  const response = await fetch(`${getRunningHubApiBase()}/media/upload/binary`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  const data = await readResponseBody(response);

  if (!response.ok) {
    throw new RunningHubHttpError(
      response.status,
      `RunningHub upload failed with HTTP ${response.status}`,
      data
    );
  }

  return data;
}

function normalizeRunBody(input: any) {
  const nodeInfoList = input?.nodeInfoList;

  if (!Array.isArray(nodeInfoList) || nodeInfoList.length === 0) {
    throw new RunningHubHttpError(
      400,
      "nodeInfoList is required and must be a non-empty array.",
      {
        example: [
          {
            nodeId: "your-node-id",
            fieldName: "text",
            fieldValue: "your runtime value",
          },
        ],
      }
    );
  }

  const payload: Record<string, unknown> = {
    nodeInfoList,
  };

  if (typeof input.addMetadata === "boolean") payload.addMetadata = input.addMetadata;
  if (typeof input.instanceType === "string" && input.instanceType) payload.instanceType = input.instanceType;
  if (typeof input.usePersonalQueue === "boolean") payload.usePersonalQueue = input.usePersonalQueue;
  if (typeof input.retainSeconds === "number") payload.retainSeconds = input.retainSeconds;
  if (typeof input.webhookUrl === "string" && input.webhookUrl) payload.webhookUrl = input.webhookUrl;

  return payload;
}

function sendError(res: ExpressResponse, error: unknown) {
  if (error instanceof RunningHubHttpError) {
    return res.status(error.status).json({
      ok: false,
      message: error.message,
      detail: error.detail,
    });
  }

  const message = error instanceof Error ? error.message : String(error);
  return res.status(500).json({ ok: false, message });
}

async function delay(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

export function registerRunningHubWorkflowProxy(app: Express) {
  app.get("/api/runninghub/workflow/config", (_req, res) => {
    res.json({
      ok: true,
      workflowId: getRunningHubWorkflowId(),
      apiBase: getRunningHubApiBase(),
      apiKeyConfigured: Boolean(getRunningHubApiKey()),
    });
  });

  app.post(
    "/api/runninghub/media/upload",
    express.raw({ type: "*/*", limit: process.env.RUNNINGHUB_UPLOAD_LIMIT || "300mb" }),
    async (req: Request, res: ExpressResponse) => {
      try {
        const fileName = decodeURIComponent(
          String(req.headers["x-file-name"] || `upload-${Date.now()}`)
        );
        const mimeType = String(req.headers["content-type"] || "application/octet-stream");
        const result = await uploadBinaryToRunningHub(req.body as Buffer, fileName, mimeType);
        res.json({ ok: true, result });
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  app.post("/api/runninghub/workflow/run", async (req: Request, res: ExpressResponse) => {
    try {
      const workflowId = String(req.body?.workflowId || getRunningHubWorkflowId());
      const payload = normalizeRunBody(req.body || {});
      const result = await runningHubJsonRequest<RunningHubTaskResponse>(
        `/run/workflow/${workflowId}`,
        payload
      );

      res.json({ ok: true, workflowId, result });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/runninghub/workflow/query", async (req: Request, res: ExpressResponse) => {
    try {
      const taskId = String(req.body?.taskId || "").trim();
      if (!taskId) {
        throw new RunningHubHttpError(400, "taskId is required.", null);
      }

      const result = await runningHubJsonRequest<RunningHubTaskResponse>("/query", { taskId });
      res.json({ ok: true, result });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/runninghub/workflow/run-and-wait", async (req: Request, res: ExpressResponse) => {
    try {
      const workflowId = String(req.body?.workflowId || getRunningHubWorkflowId());
      const timeoutMs = Math.min(Number(req.body?.timeoutMs || 180000), 300000);
      const intervalMs = Math.max(Number(req.body?.intervalMs || 4000), 1500);
      const startedAt = Date.now();
      const payload = normalizeRunBody(req.body || {});

      const createResult = await runningHubJsonRequest<RunningHubTaskResponse>(
        `/run/workflow/${workflowId}`,
        payload
      );

      const taskId = createResult.taskId;
      if (!taskId) {
        throw new RunningHubHttpError(502, "RunningHub did not return taskId.", createResult);
      }

      let latest: RunningHubTaskResponse = createResult;

      while (Date.now() - startedAt < timeoutMs) {
        if (latest.status && TERMINAL_STATUSES.has(latest.status)) {
          return res.json({ ok: true, workflowId, taskId, result: latest });
        }

        await delay(intervalMs);
        latest = await runningHubJsonRequest<RunningHubTaskResponse>("/query", { taskId });
      }

      res.status(202).json({
        ok: true,
        workflowId,
        taskId,
        timedOut: true,
        result: latest,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/runninghub/workflow/webhook", (req: Request, res: ExpressResponse) => {
    console.log("[RunningHub webhook]", JSON.stringify(req.body, null, 2));
    res.json({ ok: true });
  });
}
