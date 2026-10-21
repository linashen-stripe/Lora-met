import Metronome from '@metronome/sdk';
import {
  experimentStatePath,
  listAll,
  parseExperimentArgs,
  poll,
  readExperimentState,
  shortRunId,
  stableTransactionId,
  writeExperimentState,
} from './lib/harness';

const EXPERIMENT = 'credit-lifecycle';
const NAMESPACE = 'credit-lifecycle-experiment';
const EVENT_TYPE = 'credit_lifecycle_experiment.usage';
const CONFIRMATION = 'credit-lifecycle-experiment';

type ExperimentState = {
  version: 1;
  namespace: typeof NAMESPACE;
  runId: string;
  status: 'building' | 'ready' | 'complete' | 'cleaned' | 'failed';
  generatedAt: string;
  timeline: {
    contractStart: string;
    cancellation: string;
    usage: string;
    topUpExpiry: string;
  };
  ids: {
    metricId?: string;
    usageProductId?: string;
    creditProductId?: string;
    rateCardId?: string;
    openCustomerId?: string;
    openContractId?: string;
    endedCustomerId?: string;
    endedContractId?: string;
    replacementContractId?: string;
  };
  names: {
    metric: string;
    usageProduct: string;
    creditProduct: string;
    rateCard: string;
    openCustomer: string;
    endedCustomer: string;
  };
  transactionIds?: {
    openEnded: string;
    endedContract: string;
  };
  beforeUsage?: BalanceEvidence;
  endedContractCreationError?: string;
  report?: ExperimentReport;
  lastError?: string;
};

type BalanceEvidence = {
  openEnded: number | null;
  endedContract: number | null;
};

type ExperimentReport = {
  beforeUsage: BalanceEvidence;
  afterUsage: BalanceEvidence;
  openEndedResult: 'PASS' | 'FAIL' | 'INCONCLUSIVE';
  endedContractResult:
    | 'USABLE_AFTER_END'
    | 'NOT_USABLE_AFTER_END'
    | 'CONTRACT_CREATION_REJECTED'
    | 'INCONCLUSIVE';
  notes: string[];
};

function timeline() {
  const currentHour = new Date();
  currentHour.setUTCMinutes(0, 0, 0);
  const cancellation = new Date(currentHour.getTime() - 2 * 60 * 60 * 1_000);
  const usage = new Date(currentHour.getTime() - 60 * 60 * 1_000);
  const contractStart = new Date(
    currentHour.getTime() - 7 * 24 * 60 * 60 * 1_000,
  );
  const topUpExpiry = new Date(
    cancellation.getTime() + 60 * 24 * 60 * 60 * 1_000,
  );
  return {
    contractStart: contractStart.toISOString(),
    cancellation: cancellation.toISOString(),
    usage: usage.toISOString(),
    topUpExpiry: topUpExpiry.toISOString(),
  };
}

function newState(): ExperimentState {
  const runId = shortRunId();
  const prefix = `Experiment ${runId}`;
  return {
    version: 1,
    namespace: NAMESPACE,
    runId,
    status: 'building',
    generatedAt: new Date().toISOString(),
    timeline: timeline(),
    ids: {},
    names: {
      metric: `${prefix} - Lifecycle Usage`,
      usageProduct: `${prefix} - Lifecycle Usage`,
      creditProduct: `${prefix} - Credit Container`,
      rateCard: `${prefix} - Lifecycle Rate Card`,
      openCustomer: `${prefix} - Open Contract`,
      endedCustomer: `${prefix} - Ended Contract`,
    },
  };
}

async function resolveUsdCreditType(client: Metronome): Promise<string> {
  const available: string[] = [];
  for await (const rawUnit of client.v1.pricingUnits.list()) {
    const unit = rawUnit as any;
    if (!unit.is_currency) continue;
    available.push(String(unit.name ?? unit.id));
    if (
      String(unit.currency_code ?? '').toUpperCase() === 'USD' ||
      String(unit.name ?? '')
        .toUpperCase()
        .split(/[^A-Z]+/)
        .includes('USD')
    ) {
      return String(unit.id);
    }
  }
  throw new Error(
    `The experiment requires a USD fiat pricing unit. Found: ${available.join(', ') || 'none'}.`,
  );
}

async function save(path: string, state: ExperimentState): Promise<void> {
  state.generatedAt = new Date().toISOString();
  await writeExperimentState(path, state);
}

async function ensureCatalog(
  client: Metronome,
  path: string,
  state: ExperimentState,
): Promise<{ creditTypeId: string }> {
  const creditTypeId = await resolveUsdCreditType(client);
  if (!state.ids.metricId) {
    console.log(`Creating billable metric: ${state.names.metric}`);
    const response = await client.v1.billableMetrics.create({
      name: state.names.metric,
      aggregation_type: 'SUM',
      aggregation_key: 'quantity',
      event_type_filter: { in_values: [EVENT_TYPE] },
      property_filters: [
        { name: 'quantity', exists: true },
        { name: 'scenario', exists: true },
      ],
      group_keys: [['scenario']],
    });
    state.ids.metricId = response.data.id;
    await save(path, state);
  }
  if (!state.ids.usageProductId) {
    console.log(`Creating usage product: ${state.names.usageProduct}`);
    const response = await client.v1.contracts.products.create({
      name: state.names.usageProduct,
      type: 'USAGE',
      billable_metric_id: state.ids.metricId,
      pricing_group_key: ['scenario'],
      tags: [NAMESPACE, 'usage'],
    });
    state.ids.usageProductId = response.data.id;
    await save(path, state);
  }
  if (!state.ids.creditProductId) {
    console.log(`Creating fixed credit product: ${state.names.creditProduct}`);
    const response = await client.v1.contracts.products.create({
      name: state.names.creditProduct,
      type: 'FIXED',
      tags: [NAMESPACE],
    });
    state.ids.creditProductId = response.data.id;
    await save(path, state);
  }
  if (!state.ids.rateCardId) {
    console.log(`Creating rate card: ${state.names.rateCard}`);
    const response = await client.v1.contracts.rateCards.create({
      name: state.names.rateCard,
      description:
        'Isolated credit lifecycle experiment. Safe to archive after the run.',
      aliases: [{ name: `${NAMESPACE}-${state.runId}` }],
      fiat_credit_type_id: creditTypeId,
    });
    state.ids.rateCardId = response.data.id;
    await client.v1.contracts.rateCards.rates.addMany({
      rate_card_id: state.ids.rateCardId,
      rates: ['open-ended', 'ended-contract'].map((scenario) => ({
        product_id: state.ids.usageProductId!,
        rate_type: 'FLAT',
        price: 100,
        credit_type_id: creditTypeId,
        pricing_group_values: { scenario },
        starting_at: state.timeline.contractStart,
        entitled: true,
      })),
    });
    await save(path, state);
  }
  return { creditTypeId };
}

function credit(
  state: ExperimentState,
  creditTypeId: string,
  name: string,
  amount: number,
  startingAt: string,
  endingBefore: string,
  priority: number,
) {
  return {
    product_id: state.ids.creditProductId!,
    name,
    priority,
    rate_type: 'LIST_RATE' as const,
    applicable_product_ids: [state.ids.usageProductId!],
    access_schedule: {
      credit_type_id: creditTypeId,
      schedule_items: [
        {
          amount,
          starting_at: startingAt,
          ending_before: endingBefore,
        },
      ],
    },
  };
}

function prepaidTopUp(
  state: ExperimentState,
  creditTypeId: string,
  name: string,
  amount: number,
  startingAt: string,
  endingBefore: string,
) {
  return {
    product_id: state.ids.creditProductId!,
    name,
    type: 'PREPAID' as const,
    priority: 2,
    rate_type: 'LIST_RATE' as const,
    applicable_product_ids: [state.ids.usageProductId!],
    access_schedule: {
      credit_type_id: creditTypeId,
      schedule_items: [{ amount, starting_at: startingAt, ending_before: endingBefore }],
    },
    invoice_schedule: {
      credit_type_id: creditTypeId,
      schedule_items: [{ amount, timestamp: startingAt }],
    },
  };
}

async function createCustomer(
  client: Metronome,
  path: string,
  state: ExperimentState,
  kind: 'open' | 'ended',
): Promise<string> {
  const idKey = kind === 'open' ? 'openCustomerId' : 'endedCustomerId';
  if (state.ids[idKey]) return state.ids[idKey]!;
  const name =
    kind === 'open' ? state.names.openCustomer : state.names.endedCustomer;
  console.log(`Creating customer: ${name}`);
  const response = await client.v1.customers.create({
    name,
    ingest_aliases: [`${NAMESPACE}:customer:${kind}:run-${state.runId}`],
  });
  state.ids[idKey] = response.data.id;
  await save(path, state);
  return response.data.id;
}

async function createFixtures(
  client: Metronome,
  path: string,
  state: ExperimentState,
  creditTypeId: string,
): Promise<void> {
  const common = {
    rate_card_id: state.ids.rateCardId!,
    usage_statement_schedule: {
      frequency: 'MONTHLY' as const,
      day: 'CONTRACT_START' as const,
    },
  };
  const openCustomerId = await createCustomer(
    client,
    path,
    state,
    'open',
  );
  if (!state.ids.openContractId) {
    console.log('Creating open-ended container contract.');
    const response = await client.v1.contracts.create({
      customer_id: openCustomerId,
      name: 'Open-ended credit container',
      starting_at: state.timeline.contractStart,
      uniqueness_key: `${NAMESPACE}:contract:open:v1:run-${state.runId}`,
      ...common,
      credits: [
        credit(
          state,
          creditTypeId,
          'Last monthly plan credit',
          500,
          state.timeline.contractStart,
          state.timeline.cancellation,
          1,
        ),
      ],
      commits: [
        prepaidTopUp(
          state,
          creditTypeId,
          '60-day paid top-up',
          1_000,
          state.timeline.contractStart,
          state.timeline.topUpExpiry,
        ),
      ],
    });
    state.ids.openContractId = response.data.id;
    await save(path, state);
  }

  const endedCustomerId = await createCustomer(
    client,
    path,
    state,
    'ended',
  );
  if (!state.ids.endedContractId && !state.endedContractCreationError) {
    console.log(
      'Creating fixed-term contract whose credit extends past contract end.',
    );
    try {
      const response = await client.v1.contracts.create({
        customer_id: endedCustomerId,
        name: 'Fixed-term credit container',
        starting_at: state.timeline.contractStart,
        ending_before: state.timeline.cancellation,
        uniqueness_key: `${NAMESPACE}:contract:ended:v1:run-${state.runId}`,
        ...common,
        commits: [
          prepaidTopUp(
            state,
            creditTypeId,
            'Top-up extending past contract end',
            1_000,
            state.timeline.contractStart,
            state.timeline.topUpExpiry,
          ),
        ],
      });
      state.ids.endedContractId = response.data.id;
    } catch (error) {
      state.endedContractCreationError =
        error instanceof Error ? error.message : String(error);
      console.log(
        `Metronome rejected the extended credit fixture: ${state.endedContractCreationError}`,
      );
    }
    await save(path, state);
  }
  if (state.ids.endedContractId && !state.ids.replacementContractId) {
    console.log('Creating open-ended replacement contract.');
    const response = await client.v1.contracts.create({
      customer_id: endedCustomerId,
      name: 'Replacement contract without credits',
      starting_at: state.timeline.cancellation,
      uniqueness_key: `${NAMESPACE}:contract:replacement:v1:run-${state.runId}`,
      ...common,
    });
    state.ids.replacementContractId = response.data.id;
    await save(path, state);
  }
  state.status = 'ready';
  await save(path, state);
}

function numericBalance(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(+value)) {
    return +value;
  }
  return null;
}

async function contractGrantBalance(
  client: Metronome,
  customerId: string | undefined,
  contractId: string | undefined,
  grantName: string,
): Promise<number | null> {
  if (!customerId || !contractId) return null;
  const response = await client.v2.contracts.retrieve({
    customer_id: customerId,
    contract_id: contractId,
    include_balance: true,
  });
  const contract = response.data as any;
  const item = [...(contract.credits ?? []), ...(contract.commits ?? [])].find(
    (candidate: any) => candidate.name === grantName,
  );
  return numericBalance(item?.balance);
}

async function readEvidence(
  client: Metronome,
  state: ExperimentState,
): Promise<BalanceEvidence> {
  const [openEnded, endedContract] = await Promise.all([
    contractGrantBalance(
      client,
      state.ids.openCustomerId,
      state.ids.openContractId,
      '60-day paid top-up',
    ),
    contractGrantBalance(
      client,
      state.ids.endedCustomerId,
      state.ids.endedContractId,
      'Top-up extending past contract end',
    ),
  ]);
  return { openEnded, endedContract };
}

async function ingestUsage(
  client: Metronome,
  path: string,
  state: ExperimentState,
): Promise<void> {
  if (state.transactionIds) return;
  const transactionIds = {
    openEnded: stableTransactionId(
      `${NAMESPACE}:${state.runId}:open-ended`,
    ),
    endedContract: stableTransactionId(
      `${NAMESPACE}:${state.runId}:ended-contract`,
    ),
  };
  const usage: any[] = [
    {
      transaction_id: transactionIds.openEnded,
      customer_id: state.ids.openCustomerId!,
      event_type: EVENT_TYPE,
      timestamp: state.timeline.usage,
      properties: { quantity: 3, scenario: 'open-ended' },
    },
  ];
  if (state.ids.replacementContractId) {
    usage.push({
      transaction_id: transactionIds.endedContract,
      customer_id: state.ids.endedCustomerId!,
      event_type: EVENT_TYPE,
      timestamp: state.timeline.usage,
      properties: { quantity: 3, scenario: 'ended-contract' },
    });
  }
  console.log(`Ingesting ${usage.length} deterministic usage events.`);
  await client.v1.usage.ingest({ usage });
  state.transactionIds = transactionIds;
  await save(path, state);
}

function buildReport(
  state: ExperimentState,
  beforeUsage: BalanceEvidence,
  afterUsage: BalanceEvidence,
): ExperimentReport {
  const notes: string[] = [];
  const openEndedResult =
    beforeUsage.openEnded === null || afterUsage.openEnded === null
      ? 'INCONCLUSIVE'
      : afterUsage.openEnded < beforeUsage.openEnded
        ? 'PASS'
        : 'FAIL';
  let endedContractResult: ExperimentReport['endedContractResult'];
  if (state.endedContractCreationError) {
    endedContractResult = 'CONTRACT_CREATION_REJECTED';
    notes.push(
      `Metronome rejected the fixed-term fixture: ${state.endedContractCreationError}`,
    );
    notes.push(
      'The rejection may concern the historical contract dates or the extended access schedule; inspect the error before drawing a lifecycle conclusion.',
    );
  } else if (
    beforeUsage.endedContract === null ||
    afterUsage.endedContract === null
  ) {
    endedContractResult = 'INCONCLUSIVE';
  } else if (afterUsage.endedContract < beforeUsage.endedContract) {
    endedContractResult = 'USABLE_AFTER_END';
  } else {
    endedContractResult = 'NOT_USABLE_AFTER_END';
  }
  if (openEndedResult === 'PASS') {
    notes.push(
      'Post-cancellation usage consumed the still-active top-up on the open-ended contract.',
    );
  } else {
    notes.push(
      'The open-ended control did not show a top-up balance reduction; do not interpret the ended-contract case without investigating ingestion.',
    );
  }
  if (
    endedContractResult === 'NOT_USABLE_AFTER_END' &&
    beforeUsage.endedContract === 0
  ) {
    notes.push(
      'The extended credit balance was already zero after contract end.',
    );
  }
  return {
    beforeUsage,
    afterUsage,
    openEndedResult,
    endedContractResult,
    notes,
  };
}

async function checkExperiment(
  client: Metronome,
  path: string,
  state: ExperimentState,
  beforeOverride?: BalanceEvidence,
): Promise<ExperimentReport> {
  if (!state.ids.openContractId) {
    throw new Error('The experiment fixture is incomplete; run cleanup.');
  }
  const beforeUsage =
    beforeOverride ??
    state.beforeUsage ??
    state.report?.beforeUsage ??
    (await readEvidence(client, state));
  if (!state.beforeUsage) {
    state.beforeUsage = beforeUsage;
    await save(path, state);
  }
  if (!state.transactionIds) {
    await ingestUsage(client, path, state);
  }
  console.log('Waiting for usage attribution (up to 60 seconds).');
  const afterUsage = await poll(
    () => readEvidence(client, state),
    (evidence) =>
      beforeUsage.openEnded !== null &&
      evidence.openEnded !== null &&
      evidence.openEnded < beforeUsage.openEnded,
  );
  const report = buildReport(state, beforeUsage, afterUsage);
  state.report = report;
  state.status = 'complete';
  await save(path, state);
  printReport(report);
  return report;
}

function printReport(report: ExperimentReport): void {
  console.log('\nCredit lifecycle experiment result');
  console.log('----------------------------------');
  console.log(`Open-ended control: ${report.openEndedResult}`);
  console.log(
    `  top-up balance: ${report.beforeUsage.openEnded} → ${report.afterUsage.openEnded}`,
  );
  console.log(`Ended contract: ${report.endedContractResult}`);
  console.log(
    `  extended-credit balance: ${report.beforeUsage.endedContract} → ${report.afterUsage.endedContract}`,
  );
  for (const note of report.notes) console.log(`- ${note}`);
}

async function archiveContract(
  client: Metronome,
  customerId: string | undefined,
  contractId: string | undefined,
): Promise<void> {
  if (!customerId || !contractId) return;
  await client.v1.contracts
    .archive({
      customer_id: customerId,
      contract_id: contractId,
      void_invoices: false,
    })
    .catch((error: any) => {
      if (error?.status !== 404) throw error;
    });
}

async function cleanup(
  client: Metronome,
  path: string,
  state: ExperimentState,
): Promise<void> {
  console.log(`Cleaning experiment run ${state.runId}.`);
  await archiveContract(
    client,
    state.ids.openCustomerId,
    state.ids.openContractId,
  );
  await archiveContract(
    client,
    state.ids.endedCustomerId,
    state.ids.endedContractId,
  );
  await archiveContract(
    client,
    state.ids.endedCustomerId,
    state.ids.replacementContractId,
  );
  for (const [kind, customerId] of [
    ['open', state.ids.openCustomerId],
    ['ended', state.ids.endedCustomerId],
  ] as const) {
    if (!customerId) continue;
    await client.v1.customers.setIngestAliases({
      customer_id: customerId,
      ingest_aliases: [],
    });
    await client.v1.customers
      .archive({ id: customerId })
      .catch((error: any) => {
        if (error?.status !== 404) throw error;
      });
    console.log(`Archived ${kind} customer.`);
  }
  if (state.ids.rateCardId) {
    await client.v1.contracts.rateCards.archive({ id: state.ids.rateCardId });
  }
  for (const productId of [
    state.ids.usageProductId,
    state.ids.creditProductId,
  ]) {
    if (productId) {
      await client.v1.contracts.products.archive({ product_id: productId });
    }
  }
  if (state.ids.metricId) {
    await client.v1.billableMetrics.archive({ id: state.ids.metricId });
  }
  state.status = 'cleaned';
  await save(path, state);
  console.log('Experiment-owned resources archived.');
}

function printPlan(state: ExperimentState | null, path: string): void {
  console.log('Credit lifecycle experiment (dry run)');
  console.log('-------------------------------------');
  console.log('No resources will be created in plan mode.');
  console.log(`State: ${state ? `${state.status} run ${state.runId}` : 'none'}`);
  console.log(`State path: ${path.replace(`${process.cwd()}/`, '')}`);
  console.log('\nApply will create:');
  console.log('- one namespaced billable metric, usage product, credit product, and rate card');
  console.log('- one open-ended customer/contract with an expired plan credit and active 60-day top-up');
  console.log('- one ended contract plus an open-ended replacement contract');
  console.log('- two deterministic backdated usage events');
  console.log('\nRun with --apply to create and evaluate the fixture.');
}

function printCleanupPreview(state: ExperimentState): void {
  console.log(`Cleanup preview for experiment run ${state.runId}`);
  console.log('-----------------------------------------------');
  console.log(`Customers: ${[
    state.ids.openCustomerId,
    state.ids.endedCustomerId,
  ].filter(Boolean).length}`);
  console.log(`Contracts: ${[
    state.ids.openContractId,
    state.ids.endedContractId,
    state.ids.replacementContractId,
  ].filter(Boolean).length}`);
  console.log(
    `Catalog resources: ${[
      state.ids.metricId,
      state.ids.usageProductId,
      state.ids.creditProductId,
      state.ids.rateCardId,
    ].filter(Boolean).length}`,
  );
  console.log(
    `Re-run with --cleanup --confirm=${CONFIRMATION} to archive only these recorded resources.`,
  );
}

async function main(): Promise<void> {
  const apiKey = process.env.METRONOME_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'METRONOME_API_KEY is required in .env.metronome-target.local.',
    );
  }
  const args = parseExperimentArgs(CONFIRMATION);
  const path = experimentStatePath(EXPERIMENT, apiKey);
  let state = await readExperimentState<ExperimentState>(path);
  if (args.action === 'plan') {
    printPlan(state, path);
    return;
  }
  const client = new Metronome({ bearerToken: apiKey });
  if (args.action === 'cleanup') {
    if (!state) {
      console.log('No experiment state exists for this target account.');
      return;
    }
    if (!args.confirmed) {
      printCleanupPreview(state);
      return;
    }
    await cleanup(client, path, state);
    return;
  }
  if (args.action === 'check') {
    if (!state || state.status === 'cleaned') {
      throw new Error('No active experiment exists. Run with --apply first.');
    }
    await checkExperiment(client, path, state);
    return;
  }
  if (state && state.status !== 'cleaned') {
    if (state.status === 'ready' || state.status === 'complete') {
      console.log(`Reusing experiment run ${state.runId}.`);
      await checkExperiment(client, path, state);
      return;
    }
    throw new Error(
      `Experiment run ${state.runId} is ${state.status}. Run confirmed cleanup before retrying.`,
    );
  }
  state = newState();
  await save(path, state);
  try {
    const { creditTypeId } = await ensureCatalog(client, path, state);
    await createFixtures(client, path, state, creditTypeId);
    const beforeUsage = await readEvidence(client, state);
    state.beforeUsage = beforeUsage;
    await save(path, state);
    await ingestUsage(client, path, state);
    await checkExperiment(client, path, state, beforeUsage);
  } catch (error) {
    state.status = 'failed';
    state.lastError = error instanceof Error ? error.message : String(error);
    await save(path, state);
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
