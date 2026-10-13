'use client';

import {
  API_INSPECTOR_SESSION_HEADER,
  API_INSPECTOR_TRACE_HEADER,
  createTraceId,
  emitClientApiTrace,
  getApiInspectorSessionId,
  safeJsonParse,
  sanitizeApiValue,
} from '@/utils/apiInspector';

export async function inspectedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const sessionId = getApiInspectorSessionId();
  if (!sessionId) return fetch(input, init);

  const id = createTraceId('app');
  const startedAt = new Date().toISOString();
  const startedAtMs = performance.now();
  const method = String(init.method ?? 'GET').toUpperCase();
  const url = typeof input === 'string' ? input : input.toString();
  const headers = new Headers(init.headers);
  headers.set(API_INSPECTOR_SESSION_HEADER, sessionId);
  headers.set(API_INSPECTOR_TRACE_HEADER, id);

  emitClientApiTrace({
    id,
    source: 'app',
    method,
    url,
    startedAt,
    state: 'pending',
    request: sanitizeApiValue(safeJsonParse(init.body)),
  });

  try {
    const response = await fetch(input, { ...init, headers });
    const stream = response.headers
      .get('content-type')
      ?.includes('application/x-ndjson');
    void response
      .clone()
      .text()
      .then((text) => {
        emitClientApiTrace({
          id,
          source: 'app',
          method,
          url,
          startedAt,
          durationMs: Math.round(performance.now() - startedAtMs),
          status: response.status,
          state: response.ok ? 'success' : 'error',
          request: sanitizeApiValue(safeJsonParse(init.body)),
          response: sanitizeApiValue(safeJsonParse(text)),
          stream,
        });
      })
      .catch(() => undefined);
    return response;
  } catch (error) {
    emitClientApiTrace({
      id,
      source: 'app',
      method,
      url,
      startedAt,
      durationMs: Math.round(performance.now() - startedAtMs),
      state: 'error',
      request: sanitizeApiValue(safeJsonParse(init.body)),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
