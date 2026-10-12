/**
 * Pull balance from Metronome `POST .../customerBalances/getNetBalance` JSON.
 * Shape varies: `{ data: { balance } }`, `{ balance }`, or string amounts.
 */
export function extractBalanceFromGetNetBalanceResponse(body: unknown): unknown {
  if (body == null || typeof body !== 'object') return undefined;
  const o = body as Record<string, unknown>;
  const inner = o.data;
  if (inner != null && typeof inner === 'object') {
    const d = inner as Record<string, unknown>;
    if ('balance' in d) return d.balance;
  }
  if ('balance' in o) return o.balance;
  return undefined;
}

function coerceFiniteNumber(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Normalize Metronome net balance to USD minor units (cents).
 * Docs: default credit type is USD (cents). Payloads may use dollar floats or strings.
 */
export function metronomeNetBalanceToCents(raw: unknown): number | null {
  const n = coerceFiniteNumber(raw);
  if (n == null) return null;
  // Fractional values with small magnitude are usually whole dollars in examples
  if (Math.abs(n) < 1_000_000 && !Number.isInteger(n)) {
    return Math.round(n * 100);
  }
  return Math.round(n);
}
