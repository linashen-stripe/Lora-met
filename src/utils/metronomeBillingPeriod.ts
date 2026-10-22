export interface MetronomeBillingPeriod {
  startingAt: Date;
  endingBefore: Date;
}

function utcMonthOffset(anchor: Date, offset: number): Date {
  const targetMonth = anchor.getUTCMonth() + offset;
  const year = anchor.getUTCFullYear() + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(anchor.getUTCDate(), lastDay),
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds(),
    ),
  );
}

/**
 * Resolves the active monthly period from the contract's billing anchor.
 * Demo contracts can start mid-month, so calendar-month windows are incorrect.
 */
export function currentMetronomeMonthlyPeriod(
  contractStartingAt: string | Date | null | undefined,
  now = new Date(),
): MetronomeBillingPeriod {
  const parsed = contractStartingAt
    ? new Date(contractStartingAt)
    : new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      );
  const anchor = Number.isNaN(parsed.getTime())
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    : parsed;
  const estimatedOffset = Math.max(
    0,
    (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
      now.getUTCMonth() -
      anchor.getUTCMonth(),
  );
  let offset = estimatedOffset;
  let startingAt = utcMonthOffset(anchor, offset);

  if (startingAt.getTime() > now.getTime() && offset > 0) {
    offset -= 1;
    startingAt = utcMonthOffset(anchor, offset);
  }
  while (utcMonthOffset(anchor, offset + 1).getTime() <= now.getTime()) {
    offset += 1;
    startingAt = utcMonthOffset(anchor, offset);
  }

  return {
    startingAt,
    endingBefore: utcMonthOffset(anchor, offset + 1),
  };
}
