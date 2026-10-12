/**
 * Clone for JSON responses so NextResponse.json never throws (e.g. BigInt from Metronome/Stripe).
 */
export function toJsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v)),
  ) as T;
}
