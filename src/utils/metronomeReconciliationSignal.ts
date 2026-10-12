type ReconciliationSignal = {
  version: number;
  eventType: string | null;
  receivedAt: string;
};

const globalSignals = globalThis as typeof globalThis & {
  __metronomeReconciliationSignals?: Map<string, ReconciliationSignal>;
};

const signals =
  globalSignals.__metronomeReconciliationSignals ??
  new Map<string, ReconciliationSignal>();

globalSignals.__metronomeReconciliationSignals = signals;

export function recordMetronomeReconciliationSignal(
  customerId: string,
  eventType?: string | null,
): ReconciliationSignal {
  const previous = signals.get(customerId);
  const signal = {
    version: (previous?.version ?? 0) + 1,
    eventType: eventType ?? null,
    receivedAt: new Date().toISOString(),
  };
  signals.set(customerId, signal);
  return signal;
}

export function getMetronomeReconciliationSignal(
  customerId: string,
): ReconciliationSignal | null {
  return signals.get(customerId) ?? null;
}
