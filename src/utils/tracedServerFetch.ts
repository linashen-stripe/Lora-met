import {
  API_INSPECTOR_SESSION_HEADER,
  API_INSPECTOR_TRACE_HEADER,
  createTraceId,
  safeJsonParse,
} from '@/utils/apiInspector';
import { publishApiTrace } from '@/utils/apiInspectorServer';

export async function tracedServerFetch(
  requestHeaders: Headers,
  source: 'metronome' | 'stripe',
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const sessionId = requestHeaders.get(API_INSPECTOR_SESSION_HEADER);
  if (!sessionId) return fetch(input, init);

  const id = createTraceId(source);
  const parentId =
    requestHeaders.get(API_INSPECTOR_TRACE_HEADER) ?? undefined;
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  const method = String(init?.method ?? 'GET').toUpperCase();
  const url = typeof input === 'string' ? input : input.toString();
  try {
    const response = await fetch(input, init);
    const body = await response
      .clone()
      .text()
      .then(safeJsonParse)
      .catch(() => undefined);
    publishApiTrace(sessionId, {
      id,
      parentId,
      source,
      method,
      url,
      startedAt,
      durationMs: Date.now() - startedAtMs,
      status: response.status,
      state: response.ok ? 'success' : 'error',
      request: safeJsonParse(init?.body),
      response: body,
    });
    return response;
  } catch (error) {
    publishApiTrace(sessionId, {
      id,
      parentId,
      source,
      method,
      url,
      startedAt,
      durationMs: Date.now() - startedAtMs,
      state: 'error',
      request: safeJsonParse(init?.body),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
