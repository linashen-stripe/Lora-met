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
 * The balance is denominated in the requested credit type. For the default
 * `USD (cents)` type, even fractional values are minor units caused by
 * fractional metered quantities; they are not dollar values.
 */
export function metronomeNetBalanceToCents(raw: unknown): number | null {
  const n = coerceFiniteNumber(raw);
  if (n == null) return null;
  return Math.round(n);
}
