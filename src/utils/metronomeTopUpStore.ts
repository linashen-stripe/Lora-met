/**
 * In-memory store for Metronome auto top-up state.
 * Keyed by Metronome customer ID.
 * Uses globalThis so the Map survives Next.js dev-mode module reloads.
 */

interface TopUpStore {
  rechargeAmounts: Map<string, number>;   // dollars
  topUpTotals: Map<string, number>;       // cumulative dollars topped up
}

const globalKey = '__metronomeTopUpStore' as const;

function getStore(): TopUpStore {
  if (!(globalThis as any)[globalKey]) {
    (globalThis as any)[globalKey] = {
      rechargeAmounts: new Map<string, number>(),
      topUpTotals: new Map<string, number>(),
    };
  }
  return (globalThis as any)[globalKey];
}

export function setRechargeAmount(metronomeCustomerId: string, amountDollars: number): void {
  getStore().rechargeAmounts.set(metronomeCustomerId, amountDollars);
}

export function getRechargeAmount(metronomeCustomerId: string): number {
  return getStore().rechargeAmounts.get(metronomeCustomerId) ?? 0;
}

export function accumulateTopUp(metronomeCustomerId: string, amountDollars: number): void {
  const store = getStore();
  const prev = store.topUpTotals.get(metronomeCustomerId) ?? 0;
  store.topUpTotals.set(metronomeCustomerId, prev + amountDollars);
}

export function getTotalTopUp(metronomeCustomerId: string): number {
  return getStore().topUpTotals.get(metronomeCustomerId) ?? 0;
}
