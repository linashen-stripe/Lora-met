type ResetResource = {
  id: string;
  name?: string;
};

export type StarterResetDisplaySummary = {
  contracts: ResetResource[];
  customers: ResetResource[];
  packages: ResetResource[];
  rateCards: ResetResource[];
  products: ResetResource[];
  metrics: ResetResource[];
  retainedPricingUnit?: ResetResource | null;
  stripeCustomerIds?: string[];
};

function describe(resources: ResetResource[]): string {
  if (resources.length === 0) return 'none';
  return resources
    .map((resource) =>
      resource.name ? `${resource.name} (${resource.id})` : resource.id,
    )
    .join(', ');
}

export function logStarterResetSummary(
  log: (message: string) => void,
  {
    confirmed,
    scope,
    summary,
  }: {
    confirmed: boolean;
    scope: 'demo-data' | 'full';
    summary: StarterResetDisplaySummary;
  },
): void {
  log(
    `${confirmed ? 'Resetting' : 'Reset preview for'} ${scope} starter-owned resources:`,
  );
  log(`Contracts (${summary.contracts.length}): ${describe(summary.contracts)}`);
  log(`Customers (${summary.customers.length}): ${describe(summary.customers)}`);
  if (scope === 'full') {
    log(`Packages (${summary.packages.length}): ${describe(summary.packages)}`);
    log(`Rate cards (${summary.rateCards.length}): ${describe(summary.rateCards)}`);
    log(`Products (${summary.products.length}): ${describe(summary.products)}`);
    log(`Billable metrics (${summary.metrics.length}): ${describe(summary.metrics)}`);
  }
  if (summary.retainedPricingUnit) {
    log(
      `Retained shared pricing unit: ${describe([
        summary.retainedPricingUnit,
      ])}`,
    );
  }
  if (summary.stripeCustomerIds?.length) {
    log(
      `Stripe test customers (${summary.stripeCustomerIds.length}): ${summary.stripeCustomerIds.join(', ')}`,
    );
  }
}

export function starterResetCompletionMessage(
  scope: 'demo-data' | 'full',
  retainedPricingUnit = false,
): string {
  const base =
    scope === 'full'
      ? 'Full reset completed. Starter-owned resources were archived.'
      : 'Demo data reset completed. Starter-owned customers and contracts were archived; catalog resources were retained.';
  return retainedPricingUnit
    ? `${base} The shared custom pricing unit was retained.`
    : base;
}
