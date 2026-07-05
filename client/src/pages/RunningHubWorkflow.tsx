import { useEffect, useMemo, useState } from "react";
import MainLayout from "@/components/MainLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Copy, Play, RefreshCw, UploadCloud, Video } from "lucide-react";

type WorkflowConfig = {
  workflowId: string;
  apiBase: string;
  apiKeyConfigured: boolean;
};

type UploadResponse = {
  ok: boolean;
  result?: any;
  message?: string;
  detail?: unknown;
};

type RunningHubResult = {
  url?: string;
  nodeId?: string;
  outputType?: string;
  text?: string | null;
};

type RunningHubTask = {
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

const DEFAULT_NODE_INFO = JSON.stringify(
  [
    {
      nodeId: "填你的节点ID",
      fieldName: "填字段名，例如 text / image / video",
      fieldValue: "填运行时参数，例如提示词或上传后得到的 URL",
    },
  ],
  null,
  2
);

function extractUploadUrl(data: UploadResponse) {
  return (
    data.result?.data?.download_url ||
    data.result?.data?.url ||
    data.result?.download_url ||
    data.result?.url ||
    ""
  );
}

function isTerminalStatus(status?: string) {
  return ["SUCCESS", "FAILED", "CANCELED", "CANCELLED"].includes(status || "");
}

export default function RunningHubWorkflow() {
  const [config, setConfig] = useState<WorkflowConfig | null>(null);
  const [workflowId, setWorkflowId] = useState("2050306122774532097");
  const [instanceType, setInstanceType] = useState("default");
  const [usePersonalQueue, setUsePersonalQueue] = useState(false);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [prompt, setPrompt] = useState("");

  const [videoNodeId, setVideoNodeId] = useState("");
  const [videoFieldName, setVideoFieldName] = useState("video");
  const [imageNodeId, setImageNodeId] = useState("");
  const [imageFieldName, setImageFieldName] = useState("image");
  const [promptNodeId, setPromptNodeId] = useState("");
  const [promptFieldName, setPromptFieldName] = useState("text");

  const [nodeInfoText, setNodeInfoText] = useState(DEFAULT_NODE_INFO);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [running, setRunning] = useState(false);
  const [querying, setQuerying] = useState(false);
  const [taskId, setTaskId] = useState("");
  const [task, setTask] = useState<RunningHubTask | null>(null);
  const [rawResponse, setRawResponse] = useState("");

  useEffect(() => {
    fetch("/api/runninghub/workflow/config")
      .then(res => res.json())
      .then(data => {
        if (data?.ok) {
          setConfig(data);
          setWorkflowId(data.workflowId || "2050306122774532097");
        }
      })
      .catch(() => {
        toast.error("RunningHub config failed to load");
      });
  }, []);

  const resultItems = useMemo(() => task?.results || [], [task]);

  const uploadFile = async (file: File, kind: "video" | "image") => {
    const setUploading = kind === "video" ? setUploadingVideo : setUploadingImage;
    const setUrl = kind === "video" ? setVideoUrl : setImageUrl;

    setUploading(true);
    try {
      const response = await fetch("/api/runninghub/media/upload", {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "x-file-name": encodeURIComponent(file.name),
        },
        body: file,
      });

      const data = (await response.json()) as UploadResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.message || `Upload failed with HTTP ${response.status}`);
      }

      const uploadedUrl = extractUploadUrl(data);
      if (!uploadedUrl) {
        throw new Error("Upload succeeded but no download_url was returned.");
      }

      setUrl(uploadedUrl);
      toast.success(`${kind === "video" ? "视频" : "参考图"}上传成功`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const buildNodeInfoList = () => {
    const list: Array<{ nodeId: string; fieldName: string; fieldValue: string }> = [];

    if (videoUrl.trim() && videoNodeId.trim()) {
      list.push({
        nodeId: videoNodeId.trim(),
        fieldName: videoFieldName.trim() || "video",
        fieldValue: videoUrl.trim(),
      });
    }

    if (imageUrl.trim() && imageNodeId.trim()) {
      list.push({
        nodeId: imageNodeId.trim(),
        fieldName: imageFieldName.trim() || "image",
        fieldValue: imageUrl.trim(),
      });
    }

    if (prompt.trim() && promptNodeId.trim()) {
      list.push({
        nodeId: promptNodeId.trim(),
        fieldName: promptFieldName.trim() || "text",
        fieldValue: prompt.trim(),
      });
    }

    if (!list.length) {
      toast.error("至少填写一个节点 ID，并提供对应的 URL 或提示词");
      return;
    }

    setNodeInfoText(JSON.stringify(list, null, 2));
    toast.success("已生成 nodeInfoList");
  };

  const parseNodeInfoList = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(nodeInfoText);
    } catch {
      throw new Error("nodeInfoList 不是合法 JSON");
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("nodeInfoList 必须是非空数组");
    }

    return parsed;
  };

  const queryTask = async (id = taskId) => {
    if (!id.trim()) {
      toast.error("缺少 taskId");
      return null;
    }

    setQuerying(true);
    try {
      const response = await fetch("/api/runninghub/workflow/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: id.trim() }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.message || `Query failed with HTTP ${response.status}`);
      }

      setTask(data.result);
      setRawResponse(JSON.stringify(data, null, 2));
      return data.result as RunningHubTask;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
      return null;
    } finally {
      setQuerying(false);
    }
  };

  const runWorkflow = async () => {
    setRunning(true);
    setTask(null);
    setRawResponse("");

    try {
      const nodeInfoList = parseNodeInfoList();
      const response = await fetch("/api/runninghub/workflow/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId,
          nodeInfoList,
          instanceType,
          usePersonalQueue,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.message || `Run failed with HTTP ${response.status}`);
      }

      const createResult = data.result as RunningHubTask;
      const newTaskId = createResult.taskId || "";
      setTask(createResult);
      setRawResponse(JSON.stringify(data, null, 2));
      setTaskId(newTaskId);
      toast.success(newTaskId ? `任务已提交：${newTaskId}` : "任务已提交");

      if (newTaskId) {
        let latest = createResult;
        while (!isTerminalStatus(latest.status)) {
          await new Promise(resolve => setTimeout(resolve, 4000));
          const next = await queryTask(newTaskId);
          if (!next) break;
          latest = next;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
    } finally {
      setRunning(false);
    }
  };

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("已复制");
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-3">
                <Video className="h-8 w-8 text-primary" />
                <h1 className="text-3xl font-semibold">RunningHub 工作流在线调用</h1>
              </div>
              <p className="text-muted-foreground">
                Workflow ID：{workflowId}。上传素材后填写对应节点 ID，生成 nodeInfoList，然后提交云端工作流。
              </p>
            </div>
            <Card className="min-w-64 p-4 text-sm">
              <div className="mb-2 flex items-center gap-2 font-medium">
                {config?.apiKeyConfigured ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-600" />
                )}
                {config?.apiKeyConfigured ? "API Key 已配置" : "API Key 未配置"}
              </div>
              <div className="break-all text-xs text-muted-foreground">{config?.apiBase || "Loading..."}</div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-1">
              <Card className="p-5 shadow-lg">
                <h2 className="mb-4 text-lg font-semibold">1. 工作流参数</h2>
                <div className="space-y-4">
                  <div>
                    <Label className="mb-2 block text-sm font-semibold">Workflow ID</Label>
                    <Input value={workflowId} onChange={event => setWorkflowId(event.target.value)} />
                  </div>
                  <div>
                    <Label className="mb-2 block text-sm font-semibold">实例类型</Label>
                    <Select value={instanceType} onValueChange={setInstanceType}>
                      <option value="default">default / 24G 显存</option>
                      <option value="plus">plus / 48G 显存</option>
                    </Select>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={usePersonalQueue}
                      onChange={event => setUsePersonalQueue(event.target.checked)}
                    />
                    使用个人独占队列
                  </label>
                </div>
              </Card>

              <Card className="p-5 shadow-lg">
                <h2 className="mb-4 text-lg font-semibold">2. 上传素材</h2>
                <div className="space-y-5">
                  <div>
                    <Label className="mb-2 block text-sm font-semibold">视频文件</Label>
                    <Input type="file" accept="video/*" onChange={event => setVideoFile(event.target.files?.[0] || null)} />
                    <Button
                      className="mt-2 w-full"
                      variant="secondary"
                      disabled={!videoFile || uploadingVideo}
                      onClick={() => videoFile && uploadFile(videoFile, "video")}
                    >
                      {uploadingVideo ? <Spinner className="mr-2 h-4 w-4" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                      上传视频到 RH
                    </Button>
                    <Textarea
                      className="mt-2 min-h-16 text-xs"
                      placeholder="上传后自动填入，也可以粘贴公开视频 URL"
                      value={videoUrl}
                      onChange={event => setVideoUrl(event.target.value)}
                    />
                  </div>

                  <div>
                    <Label className="mb-2 block text-sm font-semibold">人物参考图</Label>
                    <Input type="file" accept="image/*" onChange={event => setImageFile(event.target.files?.[0] || null)} />
                    <Button
                      className="mt-2 w-full"
                      variant="secondary"
                      disabled={!imageFile || uploadingImage}
                      onClick={() => imageFile && uploadFile(imageFile, "image")}
                    >
                      {uploadingImage ? <Spinner className="mr-2 h-4 w-4" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                      上传参考图到 RH
                    </Button>
                    <Textarea
                      className="mt-2 min-h-16 text-xs"
                      placeholder="上传后自动填入，也可以粘贴公开图片 URL"
                      value={imageUrl}
                      onChange={event => setImageUrl(event.target.value)}
                    />
                  </div>
                </div>
              </Card>
            </div>

            <div className="space-y-6 lg:col-span-2">
              <Card className="p-5 shadow-lg">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <h2 className="text-lg font-semibold">3. 节点映射</h2>
                  <Button variant="outline" onClick={buildNodeInfoList}>生成 nodeInfoList</Button>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-lg border p-3">
                    <Label className="mb-2 block text-sm font-semibold">视频节点</Label>
                    <Input placeholder="nodeId" value={videoNodeId} onChange={event => setVideoNodeId(event.target.value)} />
                    <Input className="mt-2" placeholder="fieldName" value={videoFieldName} onChange={event => setVideoFieldName(event.target.value)} />
                  </div>
                  <div className="rounded-lg border p-3">
                    <Label className="mb-2 block text-sm font-semibold">参考图节点</Label>
                    <Input placeholder="nodeId" value={imageNodeId} onChange={event => setImageNodeId(event.target.value)} />
                    <Input className="mt-2" placeholder="fieldName" value={imageFieldName} onChange={event => setImageFieldName(event.target.value)} />
                  </div>
                  <div className="rounded-lg border p-3">
                    <Label className="mb-2 block text-sm font-semibold">提示词节点</Label>
                    <Input placeholder="nodeId" value={promptNodeId} onChange={event => setPromptNodeId(event.target.value)} />
                    <Input className="mt-2" placeholder="fieldName" value={promptFieldName} onChange={event => setPromptFieldName(event.target.value)} />
                  </div>
                </div>

                <div className="mt-4">
                  <Label className="mb-2 block text-sm font-semibold">提示词 / 说明词</Label>
                  <Textarea
                    className="min-h-24"
                    placeholder="例如：将视频中的人物替换为参考图人物，保持原视频动作、场景、镜头和光照。"
                    value={prompt}
                    onChange={event => setPrompt(event.target.value)}
                  />
                </div>

                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <Label className="block text-sm font-semibold">nodeInfoList JSON</Label>
                    <Button variant="ghost" size="sm" onClick={() => copyText(nodeInfoText)}>
                      <Copy className="mr-2 h-4 w-4" />复制
                    </Button>
                  </div>
                  <Textarea
                    className="min-h-56 font-mono text-xs"
                    value={nodeInfoText}
                    onChange={event => setNodeInfoText(event.target.value)}
                  />
                </div>
              </Card>

              <Card className="p-5 shadow-lg">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">4. 提交与结果</h2>
                  <div className="flex gap-2">
                    <Button variant="outline" disabled={!taskId || querying} onClick={() => queryTask()}>
                      {querying ? <Spinner className="mr-2 h-4 w-4" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                      查询
                    </Button>
                    <Button disabled={running} onClick={runWorkflow}>
                      {running ? <Spinner className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
                      提交运行
                    </Button>
                  </div>
                </div>

                <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-lg bg-muted p-3 text-sm">
                    <div className="text-xs text-muted-foreground">Task ID</div>
                    <Input className="mt-2" value={taskId} onChange={event => setTaskId(event.target.value)} placeholder="提交后自动填入" />
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-sm">
                    <div className="text-xs text-muted-foreground">Status</div>
                    <div className="mt-2 font-semibold">{task?.status || "-"}</div>
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-sm">
                    <div className="text-xs text-muted-foreground">Error</div>
                    <div className="mt-2 line-clamp-2 text-red-600">{task?.errorMessage || task?.errorCode || "-"}</div>
                  </div>
                </div>

                {resultItems.length > 0 && (
                  <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    {resultItems.map((item, index) => {
                      const type = item.outputType?.toLowerCase() || "";
                      return (
                        <div key={`${item.nodeId || "result"}-${index}`} className="rounded-lg border p-3">
                          <div className="mb-2 text-xs text-muted-foreground">
                            Node {item.nodeId || "-"} · {item.outputType || "output"}
                          </div>
                          {item.url && type === "mp4" && <video src={item.url} controls className="w-full rounded-md" />}
                          {item.url && ["png", "jpg", "jpeg", "webp", "gif"].includes(type) && (
                            <img src={item.url} alt="RunningHub result" className="w-full rounded-md" />
                          )}
                          {item.url && !["mp4", "png", "jpg", "jpeg", "webp", "gif"].includes(type) && (
                            <a className="text-sm text-primary underline" href={item.url} target="_blank" rel="noreferrer">
                              打开结果文件
                            </a>
                          )}
                          {item.text && <pre className="whitespace-pre-wrap text-xs">{item.text}</pre>}
                          {item.url && (
                            <Button className="mt-3 w-full" variant="secondary" onClick={() => copyText(item.url || "")}>
                              <Copy className="mr-2 h-4 w-4" />复制结果 URL
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <Label className="block text-sm font-semibold">Raw Response</Label>
                    <Button variant="ghost" size="sm" onClick={() => copyText(rawResponse)} disabled={!rawResponse}>
                      <Copy className="mr-2 h-4 w-4" />复制
                    </Button>
                  </div>
                  <Textarea className="min-h-64 font-mono text-xs" readOnly value={rawResponse} placeholder="RunningHub 原始响应会显示在这里" />
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
