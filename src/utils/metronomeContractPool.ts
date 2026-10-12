/**
 * Fiat / pricing-unit id from the first commit or credit that exposes it.
 * `getNetBalance` needs this when the wallet is not the default USD credit type.
 */
export function resolveCreditTypeIdFromContract(contractLike: {
  commits?: unknown[] | null;
  credits?: unknown[] | null;
}): string | undefined {
  for (const item of [
    ...((contractLike.commits ?? []) as any[]),
    ...((contractLike.credits ?? []) as any[]),
  ]) {
    const id =
      item?.access_schedule?.credit_type?.id ??
      item?.credit_type?.id ??
      item?.access_schedule?.credit_type_id;
    if (typeof id === 'string' && id.length > 0) return id;
  }
  return undefined;
}

/** Raw sum of `balance` on commits + credits (Metronome v2 `include_balance`). */
export function metronomeContractScheduleAndBalanceSums(contractLike: {
  commits?: unknown[] | null;
  credits?: unknown[] | null;
}): { scheduleSum: number; balanceSum: number } {
  const allItems = [
    ...((contractLike.commits ?? []) as any[]),
    ...((contractLike.credits ?? []) as any[]),
  ];
  const scheduleSum = allItems.reduce((sum: number, item: any) => {
    const scheduleItems = item.access_schedule?.schedule_items ?? [];
    return (
      sum +
      scheduleItems.reduce((s: number, si: any) => s + (si.amount ?? 0), 0)
    );
  }, 0);
  const balanceSum = allItems.reduce(
    (sum: number, item: any) => sum + (item.balance ?? 0),
    0,
  );
  return { scheduleSum, balanceSum };
}

/**
 * Some Metronome responses return summed line `balance` integers ~100× larger than the
 * schedule grant total (still USD minor units, finer sub-cent step). `formatPrice` expects
 * cents, so we align to the schedule-based pool cap when the mismatch is obvious.
 */
export function normalizeMetronomeSpendableSumCents(
  rawBalanceSum: number,
  scheduleSumCents: number,
  poolCapCents: number,
): number {
  const raw = Math.round(Number(rawBalanceSum) || 0);
  const cap = Math.round(Number(poolCapCents) || 0);
  if (raw <= 0) return 0;
  const sched = Math.round(Number(scheduleSumCents) || 0);
  if (sched > 0 && cap > 0 && raw > cap * 5) {
    const scaled = Math.round(raw / 100);
    if (scaled > 0 && scaled <= cap * 1.25) {
      return Math.min(scaled, cap);
    }
  }
  return cap > 0 ? Math.min(raw, cap * 100) : raw;
}

function sumCommitCreditBalancesNormalized(contractLike: {
  commits?: unknown[] | null;
  credits?: unknown[] | null;
}): number {
  const { scheduleSum, balanceSum } = metronomeContractScheduleAndBalanceSums(contractLike);
  const poolCap = scheduleSum || balanceSum;
  return normalizeMetronomeSpendableSumCents(balanceSum, scheduleSum, poolCap);
}

/**
 * Pick the contract the dashboard should treat as "current".
 *
 * **Newest `starting_at` first** — Metronome package checkout adds a Premium contract
 * without archiving Free; the old contract often still has a tiny remaining balance.
 * Sorting by balance alone would keep showing Free (looks depleted) instead of Premium.
 * Then prefer higher remaining balance, then larger pool cap.
 */
export function pickPrimaryMetronomeContract<T extends { commits?: any; credits?: any; starting_at?: string }>(
  list: T[],
): T | undefined {
  if (list.length === 0) return undefined;
  return [...list].sort((a, b) => {
    const ta = new Date(a.starting_at ?? 0).getTime();
    const tb = new Date(b.starting_at ?? 0).getTime();
    if (tb !== ta) return tb - ta;

    const availA = sumCommitCreditBalancesNormalized(a);
    const availB = sumCommitCreditBalancesNormalized(b);
    if (availB !== availA) return availB - availA;

    const capA = metronomeContractPoolCapCents({
      commits: a.commits,
      credits: a.credits,
    });
    const capB = metronomeContractPoolCapCents({
      commits: b.commits,
      credits: b.credits,
    });
    return capB - capA;
  })[0];
}

/**
 * Total pool in minor units (cents) for prepaid commits + credits on a Metronome contract.
 * Matches dashboard `creditBalance.totalAmount`: sum of scheduled grant amounts, or sum of
 * balances when schedules are empty (typical for credit-pool products without schedule rows).
 */
export function metronomeContractPoolCapCents(contractLike: {
  commits?: unknown[] | null;
  credits?: unknown[] | null;
}): number {
  const { scheduleSum, balanceSum } = metronomeContractScheduleAndBalanceSums(contractLike);
  return scheduleSum || balanceSum;
}
