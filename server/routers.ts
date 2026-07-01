import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

// TokenX24 uses OpenAI-compatible API format
const TOKENX24_API_BASE = "https://tokenx24.com/v1";

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
    // Optimize prompt using GPT
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

        try {
          const response = await fetch(`${TOKENX24_API_BASE}/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-4",
              messages: [
                {
                  role: "system",
                  content: "You are an expert at optimizing image generation prompts. Enhance the user's prompt with more descriptive details, artistic style, and quality indicators.",
                },
                {
                  role: "user",
                  content: `Optimize this image generation prompt: "${input.prompt}"`,
                },
              ],
              temperature: 0.7,
              max_tokens: 200,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `TokenX24 API error: ${response.status} - ${JSON.stringify(errorData)}`,
            });
          }

          const data = await response.json();
          const optimizedPrompt = data.choices?.[0]?.message?.content || input.prompt;

          return {
            original: input.prompt,
            optimized: optimizedPrompt,
          };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to optimize prompt: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }),

    // Generate image using DALL-E
    generate: protectedProcedure
      .input(
        z.object({
          prompt: z.string(),
          size: z.enum(["256x256", "512x512", "1024x1024", "1024x1792", "1792x1024"]).default("1024x1024"),
          quality: z.enum(["standard", "hd"]).default("standard"),
          n: z.number().int().min(1).max(10).default(1),
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

        try {
          const response = await fetch(`${TOKENX24_API_BASE}/images/generations`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "dall-e-3",
              prompt: input.prompt,
              size: input.size,
              quality: input.quality,
              n: input.n,
              response_format: "url",
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `TokenX24 API error: ${response.status} - ${JSON.stringify(errorData)}`,
            });
          }

          const data = await response.json();
          const images = data.data?.map((img: { url: string }) => ({
            url: img.url,
            timestamp: new Date().toISOString(),
          })) || [];

          return {
            prompt: input.prompt,
            images,
            created: data.created,
          };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to generate image: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }),

    // Edit/variations using image
    edit: protectedProcedure
      .input(
        z.object({
          imageUrl: z.string().url(),
          prompt: z.string(),
          size: z.enum(["256x256", "512x512", "1024x1024"]).default("1024x1024"),
          n: z.number().int().min(1).max(10).default(1),
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

        try {
          // Download image from URL
          const imageResponse = await fetch(input.imageUrl);
          if (!imageResponse.ok) {
            throw new Error("Failed to download image");
          }

          const imageBuffer = await imageResponse.arrayBuffer();
          const base64Image = Buffer.from(imageBuffer).toString("base64");
          const mimeType = imageResponse.headers.get("content-type") || "image/png";

          // Call variations endpoint
          const response = await fetch(`${TOKENX24_API_BASE}/images/variations`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "dall-e-3",
              image: base64Image,
              prompt: input.prompt,
              size: input.size,
              n: input.n,
              response_format: "url",
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `TokenX24 API error: ${response.status} - ${JSON.stringify(errorData)}`,
            });
          }

          const data = await response.json();
          const images = data.data?.map((img: { url: string }) => ({
            url: img.url,
            timestamp: new Date().toISOString(),
          })) || [];

          return {
            prompt: input.prompt,
            images,
            created: data.created,
          };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to edit image: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
