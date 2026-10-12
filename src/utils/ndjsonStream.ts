function encode(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(obj)}\n`);
}

/**
 * Wraps a worker function in a newline-delimited JSON streaming Response, so
 * long-running admin operations can report progress live instead of the
 * client waiting for one large JSON response. Protocol:
 *   {"type":"log","line":"..."}    — zero or more, in order
 *   {"type":"result", ...}         — on success, always last
 *   {"type":"error","error":"..."} — on failure, always last
 */
export function ndjsonStreamResponse<T extends object>(
  run: (onLog: (line: string) => void) => Promise<T>,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const onLog = (line: string) => controller.enqueue(encode({ type: 'log', line }));
      try {
        const result = await run(onLog);
        controller.enqueue(encode({ type: 'result', ...result }));
      } catch (error: any) {
        controller.enqueue(encode({ type: 'error', error: error?.message ?? 'Operation failed' }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
