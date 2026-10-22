import type { MetronomeContract, MetronomeCreditItem } from '@/utils/types';

export type MetronomeUsageBudgetKind =
  'monthly-seat-credits' | 'monthly-credit' | 'prepaid-commitment' | 'balance';

export interface MetronomeUsageBudget {
  amount: number;
  kind: MetronomeUsageBudgetKind;
  monthlySeatCreditTotal: number;
  contractTermCommitTotal: number;
  contractTermCommitAvailable: number;
  addOnTotal: number;
  addOnAvailable: number;
}

const ADD_ON_BALANCE_PATTERN = /top[\s-]?up|recharge|purchase|checkout/i;
const SEAT_CREDIT_PATTERN = /seat|per-seat|seat allotment/i;

function sum(
  items: readonly MetronomeCreditItem[],
  field: 'available' | 'total',
): number {
  return items.reduce((total, item) => total + item[field], 0);
}

/**
 * Chooses the plan budget used for pacing without allowing a purchased top-up
 * to replace the underlying monthly credit or contract-term commitment.
 */
export function resolveMetronomeUsageBudget(
  contract: MetronomeContract | null | undefined,
): MetronomeUsageBudget {
  const activeItems = (contract?.creditItems ?? []).filter(
    (item) => item.isActive !== false,
  );
  const addOnItems = activeItems.filter((item) =>
    ADD_ON_BALANCE_PATTERN.test(item.name),
  );
  const planItems = activeItems.filter((item) => !addOnItems.includes(item));
  const monthlySeatCredits = planItems.filter(
    (item) => item.kind === 'credit' && SEAT_CREDIT_PATTERN.test(item.name),
  );
  const recurringPlanCredits = planItems.filter(
    (item) => item.kind === 'credit',
  );
  const contractTermCommits = planItems.filter(
    (item) => item.kind === 'commit',
  );

  const monthlySeatCreditTotal = sum(monthlySeatCredits, 'total');
  const recurringPlanCreditTotal = sum(recurringPlanCredits, 'total');
  const contractTermCommitTotal = sum(contractTermCommits, 'total');
  const contractTermCommitAvailable = sum(contractTermCommits, 'available');
  const addOnTotal = sum(addOnItems, 'total');
  const addOnAvailable = sum(addOnItems, 'available');

  if (monthlySeatCreditTotal > 0) {
    return {
      amount: monthlySeatCreditTotal,
      kind: 'monthly-seat-credits',
      monthlySeatCreditTotal,
      contractTermCommitTotal,
      contractTermCommitAvailable,
      addOnTotal,
      addOnAvailable,
    };
  }
  if (recurringPlanCreditTotal > 0) {
    return {
      amount: recurringPlanCreditTotal,
      kind: 'monthly-credit',
      monthlySeatCreditTotal,
      contractTermCommitTotal,
      contractTermCommitAvailable,
      addOnTotal,
      addOnAvailable,
    };
  }
  if (contractTermCommitTotal > 0) {
    return {
      amount: contractTermCommitTotal,
      kind: 'prepaid-commitment',
      monthlySeatCreditTotal,
      contractTermCommitTotal,
      contractTermCommitAvailable,
      addOnTotal,
      addOnAvailable,
    };
  }
  return {
    amount: contract?.creditBalance.totalAmount ?? 0,
    kind: 'balance',
    monthlySeatCreditTotal,
    contractTermCommitTotal,
    contractTermCommitAvailable,
    addOnTotal,
    addOnAvailable,
  };
}
