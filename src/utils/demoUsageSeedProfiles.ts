export type DemoUsageStory = 'healthy' | 'at-risk' | 'burst';

export const DEMO_CONTRACT_LOOKBACK_DAYS = 28;

/** Keeps seeded usage in the first active billing period and the ~34-day ingest window. */
export function demoContractStart(
  now = new Date(),
  lookbackDays = DEMO_CONTRACT_LOOKBACK_DAYS,
): Date {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - lookbackDays);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

/** B2B monthly seat terms stay aligned to calendar-month billing periods. */
export function demoB2bContractStart(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );
}

/** Seed B2B usage only into the currently active monthly seat-credit period. */
export function demoB2bUsageStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function demoB2bCurrentPeriodLookbackDays(now = new Date()): number {
  return Math.max(1, now.getUTCDate() - 1);
}

/**
 * Desired consumption of each B2B seat's monthly allocation after negotiated
 * pricing is applied. Healthy and At-Risk have one spill seat. Generation's
 * Late-month Spike has two spill seats to demonstrate concurrent draw from
 * the shared commitment.
 *
 * Keep this shared between AI Builder (USD credits) and Generation (custom
 * credits). The values are unitless fractions; callers supply the correct
 * mode-specific allocation and must never convert between the two units.
 */
const B2B_SEAT_CONSUMPTION_FRACTIONS: Record<
  DemoUsageStory,
  readonly [number, number, number, number, number]
> = {
  healthy: [1.15, 0.6, 0.42, 0.25, 0.12],
  'at-risk': [1.45, 0.78, 0.58, 0.36, 0.2],
  burst: [1.75, 1.1, 0.68, 0.48, 0.28],
};

export function b2bSeatConsumptionFractions(
  story: DemoUsageStory,
): readonly number[] {
  return B2B_SEAT_CONSUMPTION_FRACTIONS[story];
}

export function b2bSeatConsumptionTargets(
  monthlySeatAllocation: number,
  story: DemoUsageStory,
): number[] {
  if (!Number.isFinite(monthlySeatAllocation) || monthlySeatAllocation <= 0) {
    throw new Error('B2B monthly seat allocation must be positive.');
  }
  return b2bSeatConsumptionFractions(story).map(
    (fraction) => monthlySeatAllocation * fraction,
  );
}

/**
 * Converts desired post-discount balance consumption into list-rate usage.
 * For example, a 0.85 multiplier requires 100 / 0.85 list-rate units to
 * consume 100 units of credit.
 */
export function listRateTargetsForConsumption(
  consumptionTargets: readonly number[],
  usageMultiplier: number,
): number[] {
  if (!Number.isFinite(usageMultiplier) || usageMultiplier <= 0) {
    throw new Error('Usage multiplier must be positive.');
  }
  return consumptionTargets.map((target) => target / usageMultiplier);
}

export function assertB2bSeatTargets(
  monthlySeatAllocation: number,
  targets: readonly number[],
  expectedExhaustedSeats = 1,
): void {
  const exhaustedSeats = targets.filter(
    (target) => target > monthlySeatAllocation,
  ).length;
  const retainedSeats = targets.filter(
    (target) => target > 0 && target < monthlySeatAllocation,
  ).length;
  if (
    targets.length !== 5 ||
    exhaustedSeats !== expectedExhaustedSeats ||
    retainedSeats !== 5 - expectedExhaustedSeats
  ) {
    throw new Error(
      `B2B seed targets must exhaust exactly ${expectedExhaustedSeats} of five seats and leave every other seat with a distinct nonzero balance.`,
    );
  }
  if (new Set(targets.map((target) => target.toFixed(6))).size !== 5) {
    throw new Error('B2B seed targets must be visibly different per seat.');
  }
}

export function expectedB2bSpillSeatCount(story: DemoUsageStory): number {
  return story === 'burst' ? 2 : 1;
}

export function preparedProConsumptionFraction(
  story: DemoUsageStory,
): number {
  if (story === 'healthy') return 0.5;
  if (story === 'at-risk') return 0.85;
  return 0.9;
}

/**
 * Quickstart is a 12-month commitment, while Metronome accepts only about
 * 34 days of backdated demo usage. Pace against elapsed contract time, with
 * small demo floors so a roughly one-month-old contract still has a readable
 * graph: 10% Healthy, 15% At-Risk, and 12% Late-month Spike.
 */
export function quickstartConsumptionFraction({
  story,
  startingAt,
  endingBefore,
  now = new Date(),
}: {
  story: DemoUsageStory;
  startingAt?: string | Date | null;
  endingBefore?: string | Date | null;
  now?: Date;
}): number {
  const start = startingAt ? new Date(startingAt) : null;
  const parsedEnd = endingBefore ? new Date(endingBefore) : null;
  if (!start || Number.isNaN(start.getTime())) {
    return story === 'healthy' ? 0.1 : story === 'at-risk' ? 0.15 : 0.12;
  }
  const fallbackEnd = new Date(start);
  fallbackEnd.setUTCFullYear(fallbackEnd.getUTCFullYear() + 1);
  const end =
    parsedEnd && !Number.isNaN(parsedEnd.getTime()) ? parsedEnd : fallbackEnd;
  const durationMs = Math.max(1, end.getTime() - start.getTime());
  const elapsedFraction = Math.min(
    1,
    Math.max(0, (now.getTime() - start.getTime()) / durationMs),
  );
  if (story === 'healthy') {
    return Math.min(0.9, Math.max(0.1, elapsedFraction));
  }
  if (story === 'at-risk') {
    return Math.min(0.95, Math.max(0.15, elapsedFraction * 1.35));
  }
  return Math.min(0.9, Math.max(0.12, elapsedFraction * 1.1));
}
