export type DemoUsageSeedStatus = {
  state: 'pending' | 'completed' | 'failed';
  message?: string;
  updatedAt: string;
};

const globalSeedStatus = globalThis as typeof globalThis & {
  __demoUsageSeedStatuses?: Map<string, DemoUsageSeedStatus>;
};

// Route handlers are bundled separately in development. Keep this process-local
// demo state on globalThis so the checkout callback and status endpoint share it.
const statuses =
  globalSeedStatus.__demoUsageSeedStatuses ??
  (globalSeedStatus.__demoUsageSeedStatuses = new Map<
    string,
    DemoUsageSeedStatus
  >());

export function setDemoUsageSeedStatus(
  customerId: string,
  state: DemoUsageSeedStatus['state'],
  message?: string,
) {
  statuses.set(customerId, {
    state,
    ...(message ? { message } : {}),
    updatedAt: new Date().toISOString(),
  });
}

export function getDemoUsageSeedStatus(
  customerId: string,
): DemoUsageSeedStatus | null {
  return statuses.get(customerId) ?? null;
}
