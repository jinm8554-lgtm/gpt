/**
 * SSE 流式客户端工具，用于处理服务器发送的事件
 */

export interface SSEEvent {
  type: string;
  [key: string]: unknown;
}

export async function streamSSE(
  events: unknown[],
  onEvent: (event: SSEEvent) => void,
  onError?: (error: Error) => void,
  onComplete?: () => void
): Promise<void> {
  try {
    // 处理从 tRPC 返回的事件数组
    for (const event of events) {
      if (event && typeof event === "object" && "type" in event) {
        onEvent(event as SSEEvent);
      }
    }
    onComplete?.();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    onError?.(err);
  }
}

export function parseSSEEvent(line: string): SSEEvent | null {
  if (!line.startsWith("data: ")) return null;

  const dataStr = line.slice(6).trim();
  if (!dataStr) return null;

  try {
    return JSON.parse(dataStr) as SSEEvent;
  } catch (error) {
    console.error("Failed to parse SSE event:", error);
    return null;
  }
}

export function extractEventData(
  events: SSEEvent[],
  eventType: string
): SSEEvent | null {
  return events.find((e) => e.type === eventType) || null;
}
