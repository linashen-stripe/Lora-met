import {
  type ApiTraceEntry,
  sanitizeApiValue,
} from '@/utils/apiInspector';

type TraceListener = (entry: ApiTraceEntry) => void;

const globalWithApiTraces = globalThis as typeof globalThis & {
  __loraApiTraceListeners?: Map<string, Set<TraceListener>>;
};
const listeners: Map<string, Set<TraceListener>> =
  globalWithApiTraces.__loraApiTraceListeners ??
  (globalWithApiTraces.__loraApiTraceListeners = new Map<
    string,
    Set<TraceListener>
  >());

export function subscribeToApiTraces(
  sessionId: string,
  listener: TraceListener,
): () => void {
  const sessionListeners = listeners.get(sessionId) ?? new Set<TraceListener>();
  sessionListeners.add(listener);
  listeners.set(sessionId, sessionListeners);
  return () => {
    sessionListeners.delete(listener);
    if (sessionListeners.size === 0) listeners.delete(sessionId);
  };
}

export function publishApiTrace(
  sessionId: string | null | undefined,
  entry: ApiTraceEntry,
): void {
  if (!sessionId) return;
  const sanitized: ApiTraceEntry = {
    ...entry,
    request: sanitizeApiValue(entry.request),
    response: sanitizeApiValue(entry.response),
    error:
      typeof entry.error === 'string'
        ? String(sanitizeApiValue(entry.error))
        : entry.error,
  };
  listeners.get(sessionId)?.forEach((listener) => listener(sanitized));
}
