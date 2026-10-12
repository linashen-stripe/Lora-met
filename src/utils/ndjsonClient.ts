export type NdjsonMessage =
  | { type: 'log'; line: string }
  | ({ type: 'result' } & Record<string, unknown>)
  | { type: 'error'; error: string };

/** Consumes a newline-delimited JSON streaming Response (see ndjsonStreamResponse on the server). */
export async function consumeNdjsonStream(
  response: Response,
  onMessage: (msg: NdjsonMessage) => void,
): Promise<void> {
  if (!response.body) throw new Error('No response body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      if (!part.trim()) continue;
      onMessage(JSON.parse(part));
    }
  }
}
