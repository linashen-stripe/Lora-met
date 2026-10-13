export const API_INSPECTOR_SESSION_HEADER = 'x-api-inspector-session';
export const API_INSPECTOR_TRACE_HEADER = 'x-api-inspector-trace';
export const API_INSPECTOR_EVENT = 'lora:api-trace';
export const API_INSPECTOR_CHILD_TRACE_PREFIX = '__API_INSPECTOR_TRACE__';
export const API_INSPECTOR_MAX_ENTRIES = 300;

export type ApiTraceSource = 'app' | 'metronome' | 'stripe';
export type ApiTraceState = 'pending' | 'success' | 'error';

export interface ApiTraceEntry {
  id: string;
  parentId?: string;
  source: ApiTraceSource;
  method: string;
  url: string;
  startedAt: string;
  durationMs?: number;
  status?: number;
  state: ApiTraceState;
  request?: unknown;
  response?: unknown;
  error?: string;
  stream?: boolean;
}

const SECRET_KEY_PATTERN =
  /authorization|cookie|secret|api[_-]?key|client[_-]?secret|authentication[_-]?token|stripe[_-]?signature|password/i;
const PAYMENT_KEY_PATTERN =
  /card|bank_account|us_bank_account|billing_details|payment_method_data/i;
const EMAIL_PATTERN = /\b([A-Z0-9._%+-]{1,64})@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;
const MAX_STRING_LENGTH = 2_000;
const MAX_ARRAY_LENGTH = 50;
const MAX_OBJECT_KEYS = 75;
const MAX_DEPTH = 7;

function maskEmails(value: string): string {
  return value.replace(EMAIL_PATTERN, (_match, local: string, domain: string) => {
    const first = local.charAt(0) || '*';
    return `${first}***@${domain}`;
  });
}

function sanitizeString(value: string): string {
  const masked = maskEmails(value)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]+/g, '[REDACTED]')
    .replace(/\bmtr_[A-Za-z0-9_-]+/gi, '[REDACTED]');
  if (masked.length <= MAX_STRING_LENGTH) return masked;
  return `${masked.slice(0, MAX_STRING_LENGTH)}… [truncated]`;
}

export function sanitizeApiValue(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value !== 'object') return String(value);
  if (depth >= MAX_DEPTH) return '[max depth]';
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (value instanceof Headers) {
    return sanitizeApiValue(Object.fromEntries(value.entries()), depth + 1, seen);
  }
  if (Array.isArray(value)) {
    const sanitized = value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item) => sanitizeApiValue(item, depth + 1, seen));
    if (value.length > MAX_ARRAY_LENGTH) {
      sanitized.push(`[${value.length - MAX_ARRAY_LENGTH} more items]`);
    }
    return sanitized;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const sanitizedEntries = entries
    .slice(0, MAX_OBJECT_KEYS)
    .map(([key, item]) => {
      if (SECRET_KEY_PATTERN.test(key) || PAYMENT_KEY_PATTERN.test(key)) {
        return [key, '[REDACTED]'];
      }
      if (/email|ingest_alias/i.test(key) && typeof item === 'string') {
        return [key, maskEmails(item)];
      }
      return [key, sanitizeApiValue(item, depth + 1, seen)];
    });
  if (entries.length > MAX_OBJECT_KEYS) {
    sanitizedEntries.push([
      '[truncated]',
      `${entries.length - MAX_OBJECT_KEYS} more fields`,
    ]);
  }
  return Object.fromEntries(sanitizedEntries);
}

export function safeJsonParse(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (!value.trim()) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function createTraceId(prefix = 'trace'): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

export function emitClientApiTrace(entry: ApiTraceEntry): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ApiTraceEntry>(API_INSPECTOR_EVENT, { detail: entry }),
  );
}

export function getApiInspectorSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const settings = JSON.parse(localStorage.getItem('settings') || '{}');
    if (!settings.apiInspectorEnabled) return null;
    const key = 'apiInspectorSessionId';
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const created = createTraceId('session');
    sessionStorage.setItem(key, created);
    return created;
  } catch {
    return null;
  }
}
