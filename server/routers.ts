import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

const TOKENX24_API_BASE = "https://tokenx24.com/api/v1";

// Helper function to stream SSE responses
async function streamSSE(
  url: string,
  body: Record<string, unknown>,
  token: string,
  onChunk: (chunk: string) => void
): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `TokenX24 API error: ${response.status} - ${errorText}`,
    });
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const dataStr = line.slice(6).trim();
          if (dataStr) {
            onChunk(dataStr);
          }
        }
      }
    }
  } finally {
    reader.cancel();
  }
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  aiImage: router({
    optimize: protectedProcedure
      .input(z.object({ prompt: z.string() }))
      .mutation(async ({ input }) => {
        const token = process.env.TOKENX24_API_TOKEN;
        if (!token) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "API token not configured",
          });
        }

        const events: unknown[] = [];
        await streamSSE(
          `${TOKENX24_API_BASE}/ai-image/optimize`,
          { prompt: input.prompt },
          token,
          (chunk) => {
            try {
              events.push(JSON.parse(chunk));
            } catch (e) {
              console.error("Failed to parse SSE chunk:", e);
            }
          }
        );
        return events;
      }),

    generate: protectedProcedure
      .input(
        z.object({
          prompt: z.string(),
          aspect_ratio: z.string().optional(),
          size: z.string().optional(),
          quality: z.string().optional(),
          n: z.number().optional(),
          optimize_prompt: z.boolean().optional(),
          output_format: z.string().optional(),
          output_compression: z.number().nullable().optional(),
          moderation: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const token = process.env.TOKENX24_API_TOKEN;
        if (!token) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "API token not configured",
          });
        }

        const events: unknown[] = [];
        await streamSSE(
          `${TOKENX24_API_BASE}/ai-image/generate`,
          input,
          token,
          (chunk) => {
            try {
              events.push(JSON.parse(chunk));
            } catch (e) {
              console.error("Failed to parse SSE chunk:", e);
            }
          }
        );
        return events;
      }),

    edit: protectedProcedure
      .input(
        z.object({
          prompt: z.string(),
          images: z.array(z.object({ image_url: z.string() })),
          mask: z.object({ image_url: z.string() }).optional(),
          size: z.string().optional(),
          quality: z.string().optional(),
          n: z.number().optional(),
          output_format: z.string().optional(),
          output_compression: z.number().nullable().optional(),
          moderation: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const token = process.env.TOKENX24_API_TOKEN;
        if (!token) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "API token not configured",
          });
        }

        const events: unknown[] = [];
        await streamSSE(
          `${TOKENX24_API_BASE}/ai-image/edit`,
          input,
          token,
          (chunk) => {
            try {
              events.push(JSON.parse(chunk));
            } catch (e) {
              console.error("Failed to parse SSE chunk:", e);
            }
          }
        );
        return events;
      }),
  }),
});

export type AppRouter = typeof appRouter;
