import Metronome from '@metronome/sdk';
import {
  experimentStatePath,
  parseExperimentArgs,
  poll,
  readExperimentState,
  shortRunId,
  stableTransactionId,
  writeExperimentState,
} from './lib/harness';

const EXPERIMENT = 'integration-qa';
const NAMESPACE = 'integration-qa-experiment';
const EVENT_TYPE = 'integration_qa.usage';
const CONFIRMATION = 'integration-qa-experiment';
const API_BASE = 'https://api.metronome.com';

type Json = Record<string, any>;
type ApiEvidence = {
  label: string;
  method: string;
  path: string;
  request: unknown;
  status: number;
  response: unknown;
};

type ExperimentState = {
  version: 1;
  namespace: typeof NAMESPACE;
  runId: string;
  status: 'building' | 'complete' | 'cleaned' | 'failed';
  generatedAt: string;
  ids: {
    metricId?: string;
    usageProductId?: string;
    creditProductId?: string;
    rateCardId?: string;
    customerIds: string[];
    contractIds: Array<{
      label: string;
      customerId: string;
      contractId: string;
    }>;
  };
  evidence: ApiEvidence[];
  findings: Record<string, unknown>;
  lastError?: string;
};

function nowTimeline() {
  const hour = new Date();
  hour.setUTCMinutes(0, 0, 0);
  const iso = (offsetHours: number) =>
    new Date(hour.getTime() + offsetHours * 60 * 60 * 1_000).toISOString();
  return {
    contractStart: iso(-48),
    oldWindowStart: iso(-4),
    delayedUsage: iso(-2),
    oldWindowEnd: iso(-1),
    currentUsage: iso(0),
    tomorrow: iso(24),
    later: iso(48),
    invalidOldUsage: iso(-35 * 24),
  };
}

function newState(): ExperimentState {
  return {
    version: 1,
    namespace: NAMESPACE,
    runId: shortRunId(),
    status: 'building',
    generatedAt: new Date().toISOString(),
    ids: { customerIds: [], contractIds: [] },
    evidence: [],
    findings: {},
  };
}

async function save(path: string, state: ExperimentState): Promise<void> {
  state.generatedAt = new Date().toISOString();
  await writeExperimentState(path, state);
}

function printJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function compactResponse(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const body = value as Json;
  if (body.id || body.data?.id) {
    return {
      id: body.id ?? body.data?.id,
      ...(body.error ? { error: body.error } : {}),
      ...(body.message ? { message: body.message } : {}),
    };
  }
  return value;
}

async function rawApi(
  apiKey: string,
  state: ExperimentState,
  label: string,
  method: string,
  path: string,
  request?: unknown,
  idempotencyKey?: string,
): Promise<{ status: number; body: any }> {
  console.log(`\n[API] ${label}`);
  console.log(`${method} ${path}`);
  if (request !== undefined) console.log(printJson(request));
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    ...(request === undefined ? {} : { body: JSON.stringify(request) }),
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Preserve non-JSON API errors as text evidence.
  }
  console.log(`→ HTTP ${response.status}`);
  console.log(printJson(compactResponse(body)));
  state.evidence.push({
    label,
    method,
    path,
    request,
    status: response.status,
    response: body,
  });
  return { status: response.status, body };
}

async function resolveUsdCreditType(client: Metronome): Promise<string> {
  for await (const rawUnit of client.v1.pricingUnits.list()) {
    const unit = rawUnit as Json;
    if (
      unit.is_currency &&
      (String(unit.currency_code ?? '').toUpperCase() === 'USD' ||
        String(unit.name ?? '').toUpperCase().includes('USD'))
    ) {
      return String(unit.id);
    }
  }
  throw new Error('A USD fiat pricing unit is required.');
}

async function ensureCatalog(
  client: Metronome,
  path: string,
  state: ExperimentState,
): Promise<string> {
  const creditTypeId = await resolveUsdCreditType(client);
  const prefix = `Experiment ${state.runId}`;
  if (!state.ids.metricId) {
    console.log('\n[API] Create isolated billable metric');
    console.log('POST /v1/billableMetrics/create');
    const response = await client.v1.billableMetrics.create({
      name: `${prefix} - Q&A Usage`,
      aggregation_type: 'SUM',
      aggregation_key: 'quantity',
      event_type_filter: { in_values: [EVENT_TYPE] },
      property_filters: [{ name: 'quantity', exists: true }],
    });
    state.ids.metricId = response.data.id;
    await save(path, state);
  }
  if (!state.ids.usageProductId) {
    console.log('\n[API] Create isolated usage product');
    console.log('POST /v1/contract-pricing/products/create');
    const response = await client.v1.contracts.products.create({
      name: `${prefix} - Q&A Usage`,
      type: 'USAGE',
      billable_metric_id: state.ids.metricId,
      tags: [NAMESPACE, 'usage'],
    });
    state.ids.usageProductId = response.data.id;
    await save(path, state);
  }
  if (!state.ids.creditProductId) {
    console.log('\n[API] Create isolated credit product');
    console.log('POST /v1/contract-pricing/products/create');
    const response = await client.v1.contracts.products.create({
      name: `${prefix} - Q&A Credit`,
      type: 'FIXED',
      tags: [NAMESPACE],
    });
    state.ids.creditProductId = response.data.id;
    await save(path, state);
  }
  if (!state.ids.rateCardId) {
    console.log('\n[API] Create rate card and $1/unit rate');
    console.log('POST /v1/contract-pricing/rate-cards/create');
    const response = await client.v1.contracts.rateCards.create({
      name: `${prefix} - Q&A Rate Card`,
      description: 'Isolated Metronome integration Q&A verification.',
      aliases: [{ name: `${NAMESPACE}-${state.runId}` }],
      fiat_credit_type_id: creditTypeId,
    });
    state.ids.rateCardId = response.data.id;
    await client.v1.contracts.rateCards.rates.addMany({
      rate_card_id: state.ids.rateCardId,
      rates: [
        {
          product_id: state.ids.usageProductId,
          rate_type: 'FLAT',
          price: 100,
          credit_type_id: creditTypeId,
          starting_at: nowTimeline().contractStart,
          entitled: true,
        },
      ],
    });
    await save(path, state);
  }
  return creditTypeId;
}

function credit(
  state: ExperimentState,
  creditTypeId: string,
  name: string,
  amount: number,
  startingAt: string,
  endingBefore: string,
  priority?: number,
) {
  return {
    product_id: state.ids.creditProductId!,
    name,
    rate_type: 'LIST_RATE' as const,
    applicable_product_ids: [state.ids.usageProductId!],
    ...(priority === undefined ? {} : { priority }),
    access_schedule: {
      credit_type_id: creditTypeId,
      schedule_items: [
        { amount, starting_at: startingAt, ending_before: endingBefore },
      ],
    },
  };
}

async function createCustomerAndContract(
  client: Metronome,
  path: string,
  state: ExperimentState,
  label: string,
  credits: Json[] = [],
): Promise<{ customerId: string; contractId: string }> {
  const suffix = label.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-');
  console.log(`\n[API] Create customer for ${label}`);
  console.log('POST /v1/customers/create');
  const customer = await client.v1.customers.create({
    name: `Experiment ${state.runId} - ${label}`,
    ingest_aliases: [`${NAMESPACE}:${state.runId}:${suffix}`],
  });
  state.ids.customerIds.push(customer.data.id);
  await save(path, state);

  console.log(`[API] Create open-ended contract for ${label}`);
  console.log('POST /v1/contracts/create');
  const contract = await client.v1.contracts.create({
    customer_id: customer.data.id,
    name: `${label} contract`,
    starting_at: nowTimeline().contractStart,
    rate_card_id: state.ids.rateCardId!,
    uniqueness_key: `${NAMESPACE}:contract:${suffix}:${state.runId}`,
    usage_statement_schedule: {
      frequency: 'MONTHLY',
      day: 'CONTRACT_START',
    },
    credits: credits as any,
  });
  state.ids.contractIds.push({
    label,
    customerId: customer.data.id,
    contractId: contract.data.id,
  });
  await save(path, state);
  return { customerId: customer.data.id, contractId: contract.data.id };
}

async function retrieveContract(
  client: Metronome,
  customerId: string,
  contractId: string,
): Promise<Json> {
  const response = await client.v2.contracts.retrieve({
    customer_id: customerId,
    contract_id: contractId,
    include_balance: true,
  });
  return response.data as Json;
}

function balancesByName(contract: Json): Record<string, number | null> {
  return Object.fromEntries(
    [...(contract.credits ?? []), ...(contract.commits ?? [])].map(
      (item: Json) => [
        String(item.name),
        typeof item.balance === 'number' ? item.balance : null,
      ],
    ),
  );
}

async function ingest(
  client: Metronome,
  state: ExperimentState,
  label: string,
  customerId: string,
  timestamp: string,
  quantity = 1,
): Promise<void> {
  const request = [
    {
      transaction_id: stableTransactionId(
        `${NAMESPACE}:${state.runId}:${label}`,
      ),
      customer_id: customerId,
      event_type: EVENT_TYPE,
      timestamp,
      properties: { quantity },
    },
  ];
  console.log(`\n[API] ${label}`);
  console.log('POST /v1/ingest');
  console.log(printJson(request));
  await client.v1.usage.ingest({ usage: request });
  console.log('→ accepted');
}

async function waitForBalances(
  client: Metronome,
  customerId: string,
  contractId: string,
  settled: (balances: Record<string, number | null>) => boolean,
): Promise<Record<string, number | null>> {
  const contract = await poll(
    () => retrieveContract(client, customerId, contractId),
    (value) => settled(balancesByName(value)),
    { attempts: 40, intervalMs: 2_000 },
  );
  return balancesByName(contract);
}

async function listInvoices(
  client: Metronome,
  customerId: string,
): Promise<Json[]> {
  const invoices: Json[] = [];
  for await (const invoice of client.v1.customers.invoices.list({
    customer_id: customerId,
  })) {
    invoices.push(invoice as Json);
  }
  return invoices;
}

async function testPriority(
  client: Metronome,
  path: string,
  state: ExperimentState,
  creditTypeId: string,
): Promise<void> {
  const t = nowTimeline();
  const priority = await createCustomerAndContract(
    client,
    path,
    state,
    'Q1 priority ordering',
    [
      credit(state, creditTypeId, 'Monthly priority 1', 200, t.contractStart, t.tomorrow, 1),
      credit(state, creditTypeId, 'Top-up priority 2', 200, t.contractStart, t.later, 2),
    ],
  );
  await ingest(client, state, 'Q1 lower priority number drawdown', priority.customerId, t.currentUsage);
  const priorityBalances = await waitForBalances(
    client,
    priority.customerId,
    priority.contractId,
    (balances) => balances['Monthly priority 1'] === 100,
  );
  const acceptance = await createCustomerAndContract(
    client,
    path,
    state,
    'Q1 priority acceptance',
    [
      credit(state, creditTypeId, 'Unix timestamp priority', 100, t.contractStart, t.later, 1_800_000_000),
      credit(state, creditTypeId, 'Priority omitted', 100, t.contractStart, t.later),
    ],
  );
  const priorityContract = await retrieveContract(
    client,
    acceptance.customerId,
    acceptance.contractId,
  );

  const tie = await createCustomerAndContract(
    client,
    path,
    state,
    'Q1 expiry tiebreaker',
    [
      credit(state, creditTypeId, 'Equal priority earlier expiry', 200, t.contractStart, t.tomorrow, 10),
      credit(state, creditTypeId, 'Equal priority later expiry', 200, t.contractStart, t.later, 10),
    ],
  );
  await ingest(client, state, 'Q1 equal priority expiry tiebreaker', tie.customerId, t.currentUsage);
  const tieBalances = await waitForBalances(
    client,
    tie.customerId,
    tie.contractId,
    (balances) => balances['Equal priority earlier expiry'] === 100,
  );
  state.findings.q1 = {
    result: 'OBSERVED',
    priorityBalances,
    tieBalances,
    returnedPriorities: Object.fromEntries(
      (priorityContract.credits ?? []).map((item: Json) => [
        item.name,
        item.priority ?? null,
      ]),
    ),
    limitation:
      'Acceptance of 1,800,000,000 does not establish a documented or permanent numeric range guarantee.',
  };
  await save(path, state);
}

async function testEditsAndIdempotency(
  apiKey: string,
  client: Metronome,
  path: string,
  state: ExperimentState,
  creditTypeId: string,
): Promise<void> {
  const t = nowTimeline();
  const first = await createCustomerAndContract(
    client,
    path,
    state,
    'Q2 and Q5 contract edit',
  );
  const uniquenessKey = `${NAMESPACE}:edit:${state.runId}`;
  const editBody = {
    customer_id: first.customerId,
    contract_id: first.contractId,
    uniqueness_key: uniquenessKey,
    add_credits: [
      credit(state, creditTypeId, 'Webhook monthly credit', 300, t.contractStart, t.tomorrow, 1),
    ],
  };
  const firstEdit = await rawApi(
    apiKey,
    state,
    'Q2 add monthly credit after external payment',
    'POST',
    '/v2/contracts/edit',
    editBody,
  );
  const duplicateEdit = await rawApi(
    apiKey,
    state,
    'Q5 retry same contract edit uniqueness_key',
    'POST',
    '/v2/contracts/edit',
    editBody,
  );

  const second = await createCustomerAndContract(
    client,
    path,
    state,
    'Q5 uniqueness scope',
  );
  const crossContract = await rawApi(
    apiKey,
    state,
    'Q5 reuse edit uniqueness_key on another contract',
    'POST',
    '/v2/contracts/edit',
    { ...editBody, customer_id: second.customerId, contract_id: second.contractId },
  );

  const idempotencyKey = `${NAMESPACE}-http-${state.runId}`;
  const idempotentBody = {
    customer_id: first.customerId,
    contract_id: first.contractId,
    add_credits: [
      credit(state, creditTypeId, 'Header-idempotent credit', 200, t.contractStart, t.later, 3),
    ],
  };
  const headerFirst = await rawApi(
    apiKey,
    state,
    'Q5 first Idempotency-Key request',
    'POST',
    '/v2/contracts/edit',
    idempotentBody,
    idempotencyKey,
  );
  const headerRepeat = await rawApi(
    apiKey,
    state,
    'Q5 identical Idempotency-Key retry',
    'POST',
    '/v2/contracts/edit',
    idempotentBody,
    idempotencyKey,
  );
  const headerConflict = await rawApi(
    apiKey,
    state,
    'Q5 changed payload with same Idempotency-Key',
    'POST',
    '/v2/contracts/edit',
    {
      ...idempotentBody,
      add_credits: [
        credit(state, creditTypeId, 'Header-idempotent credit', 201, t.contractStart, t.later, 3),
      ],
    },
    idempotencyKey,
  );
  const contract = await retrieveContract(client, first.customerId, first.contractId);
  state.findings.q2 = {
    result: firstEdit.status < 300 ? 'PASS' : 'FAIL',
    addedCreditCount: (contract.credits ?? []).filter(
      (item: Json) => item.name === 'Webhook monthly credit',
    ).length,
  };
  state.findings.q5 = {
    editUniquenessStatuses: {
      first: firstEdit.status,
      identicalRetry: duplicateEdit.status,
      anotherContract: crossContract.status,
    },
    idempotencyHeaderStatuses: {
      first: headerFirst.status,
      identicalRetry: headerRepeat.status,
      changedPayload: headerConflict.status,
    },
    limitation:
      'A short experiment cannot prove retention for days, weeks, or indefinitely.',
  };
  await save(path, state);
}

async function testTimestampAndNoProvider(
  client: Metronome,
  path: string,
  state: ExperimentState,
  creditTypeId: string,
): Promise<void> {
  const t = nowTimeline();
  const fixture = await createCustomerAndContract(
    client,
    path,
    state,
    'Q4 Q6 Q12 no-provider delayed event',
    [
      credit(state, creditTypeId, 'Expired before receipt', 200, t.oldWindowStart, t.oldWindowEnd, 1),
      credit(state, creditTypeId, 'Current fallback', 200, t.contractStart, t.later, 2),
    ],
  );
  await ingest(
    client,
    state,
    'Q6 delayed event using historical timestamp',
    fixture.customerId,
    t.delayedUsage,
  );
  const invoices = await poll(
    () => listInvoices(client, fixture.customerId),
    (rows) =>
      rows.some((invoice) =>
        (invoice.line_items ?? []).some(
          (line: Json) =>
            Number(line.total ?? 0) !== 0 ||
            String(line.name ?? '').includes('applied'),
        ),
      ),
    { attempts: 40, intervalMs: 2_000 },
  );
  const appliedLines = invoices.flatMap((invoice) =>
    (invoice.line_items ?? []).map((line: Json) => ({
      name: line.name,
      total: line.total,
      creditId: line.credit_id ?? line.commit_id ?? null,
      externalInvoice: invoice.external_invoice ?? null,
      status: invoice.status,
    })),
  );
  const contract = await retrieveContract(client, fixture.customerId, fixture.contractId);
  state.findings.q4 = {
    metronomeInvoiceCount: invoices.length,
    externalInvoices: invoices.map((invoice) => invoice.external_invoice ?? null),
    statuses: invoices.map((invoice) => invoice.status),
  };
  state.findings.q6 = {
    eventTimestamp: t.delayedUsage,
    creditEndedBeforeReceiptAt: t.oldWindowEnd,
    appliedLines,
    balances: balancesByName(contract),
  };
  state.findings.q12 = {
    billingProviderConfiguration:
      contract.billing_provider_configuration ?? null,
    metronomeOperatedWithoutStripe: true,
    demonstratedBackdatedUsageWithin34Days: true,
  };
  await save(path, state);
}

async function testArchivedCredit(
  apiKey: string,
  client: Metronome,
  path: string,
  state: ExperimentState,
  creditTypeId: string,
): Promise<void> {
  const t = nowTimeline();
  const fixture = await createCustomerAndContract(
    client,
    path,
    state,
    'Q7 archived credit fallback',
    [
      credit(state, creditTypeId, 'Credit to archive', 200, t.contractStart, t.later, 1),
      credit(state, creditTypeId, 'Fallback after archive', 200, t.contractStart, t.later, 2),
    ],
  );
  const before = await retrieveContract(client, fixture.customerId, fixture.contractId);
  const target = (before.credits ?? []).find(
    (item: Json) => item.name === 'Credit to archive',
  );
  if (!target?.id) throw new Error('Could not resolve the Q7 credit ID.');
  const archived = await rawApi(
    apiKey,
    state,
    'Q7 archive credit before late usage arrives',
    'POST',
    '/v2/contracts/credits/archive',
    { customer_id: fixture.customerId, credit_id: target.id },
  );
  await ingest(
    client,
    state,
    'Q7 event arriving after credit archive',
    fixture.customerId,
    t.currentUsage,
  );
  const balances = await waitForBalances(
    client,
    fixture.customerId,
    fixture.contractId,
    (value) => value['Fallback after archive'] === 100,
  );
  state.findings.q7 = {
    archiveStatus: archived.status,
    archivedCreditId: target.id,
    balances,
  };
  await save(path, state);
}

async function testInvalidBatch(
  apiKey: string,
  client: Metronome,
  path: string,
  state: ExperimentState,
  creditTypeId: string,
): Promise<void> {
  const t = nowTimeline();
  const fixture = await createCustomerAndContract(
    client,
    path,
    state,
    'Q8 atomic invalid batch',
    [credit(state, creditTypeId, 'Batch test credit', 300, t.contractStart, t.later, 1)],
  );
  const valid = {
    transaction_id: stableTransactionId(`${NAMESPACE}:${state.runId}:q8-valid`),
    customer_id: fixture.customerId,
    event_type: EVENT_TYPE,
    timestamp: t.currentUsage,
    properties: { quantity: 1 },
  };
  const invalid = {
    transaction_id: stableTransactionId(`${NAMESPACE}:${state.runId}:q8-invalid`),
    customer_id: fixture.customerId,
    event_type: EVENT_TYPE,
    timestamp: t.invalidOldUsage,
    properties: { quantity: 1 },
  };
  const rejected = await rawApi(
    apiKey,
    state,
    'Q8 mixed valid and invalid ingest batch',
    'POST',
    '/v1/ingest',
    [valid, invalid],
  );
  await new Promise((resolveWait) => setTimeout(resolveWait, 4_000));
  const afterRejected = balancesByName(
    await retrieveContract(client, fixture.customerId, fixture.contractId),
  );
  const accepted = await rawApi(
    apiKey,
    state,
    'Q8 resend valid event alone',
    'POST',
    '/v1/ingest',
    [valid],
  );
  const afterAccepted = await waitForBalances(
    client,
    fixture.customerId,
    fixture.contractId,
    (balances) => balances['Batch test credit'] === 200,
  );
  state.findings.q8 = {
    mixedBatchStatus: rejected.status,
    balanceAfterRejectedBatch: afterRejected['Batch test credit'],
    validOnlyStatus: accepted.status,
    balanceAfterValidOnly: afterAccepted['Batch test credit'],
    rejectedResponse: rejected.body,
  };
  await save(path, state);
}

function printFindings(state: ExperimentState): void {
  console.log('\nMetronome integration Q&A evidence');
  console.log('==================================');
  for (const [question, finding] of Object.entries(state.findings)) {
    console.log(`\n${question.toUpperCase()}`);
    console.log(printJson(finding));
  }
  console.log(
    '\nQ3 was verified separately by experiment:credit-lifecycle: open-ended top-up 1000 → 700; ended-contract top-up 0 → 0.',
  );
  console.log(
    'Q9, Q10 account-specific ceilings, Q11, and Q12a require documentation or Metronome confirmation rather than destructive/load CLI tests.',
  );
}

async function refreshBalanceEvidence(
  client: Metronome,
  path: string,
  state: ExperimentState,
): Promise<void> {
  const refresh = async (
    label: string,
  ): Promise<Record<string, number | null> | null> => {
    const fixture = state.ids.contractIds.find((item) => item.label === label);
    if (!fixture) return null;
    return balancesByName(
      await retrieveContract(client, fixture.customerId, fixture.contractId),
    );
  };
  const [priority, tie, archived, batch] = await Promise.all([
    refresh('Q1 priority ordering'),
    refresh('Q1 expiry tiebreaker'),
    refresh('Q7 archived credit fallback'),
    refresh('Q8 atomic invalid batch'),
  ]);
  if (priority && state.findings.q1 && typeof state.findings.q1 === 'object') {
    (state.findings.q1 as Json).priorityBalances = priority;
    const fixture = state.ids.contractIds.find(
      (item) => item.label === 'Q1 priority ordering',
    );
    if (fixture) {
      const invoices = await listInvoices(client, fixture.customerId);
      (state.findings.q1 as Json).invoiceLinesAtCheck = invoices.flatMap(
        (invoice) =>
          (invoice.line_items ?? []).map((line: Json) => ({
            name: line.name,
            total: line.total,
            creditId: line.credit_id ?? line.commit_id ?? null,
          })),
      );
    }
  }
  if (tie && state.findings.q1 && typeof state.findings.q1 === 'object') {
    (state.findings.q1 as Json).tieBalances = tie;
  }
  if (archived && state.findings.q7 && typeof state.findings.q7 === 'object') {
    (state.findings.q7 as Json).balances = archived;
  }
  if (batch && state.findings.q8 && typeof state.findings.q8 === 'object') {
    (state.findings.q8 as Json).balanceAtCheck = batch['Batch test credit'];
  }
  await save(path, state);
}

async function archiveContract(
  client: Metronome,
  customerId: string,
  contractId: string,
): Promise<void> {
  await client.v1.contracts
    .archive({ customer_id: customerId, contract_id: contractId, void_invoices: false })
    .catch((error: any) => {
      if (error?.status !== 404) throw error;
    });
}

async function cleanup(
  client: Metronome,
  path: string,
  state: ExperimentState,
): Promise<void> {
  console.log(`Cleaning isolated run ${state.runId}.`);
  for (const item of state.ids.contractIds) {
    await archiveContract(client, item.customerId, item.contractId);
  }
  for (const customerId of state.ids.customerIds) {
    await client.v1.customers
      .setIngestAliases({ customer_id: customerId, ingest_aliases: [] })
      .catch(() => undefined);
    await client.v1.customers.archive({ id: customerId }).catch((error: any) => {
      if (error?.status !== 404) throw error;
    });
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
  console.log('Metronome integration Q&A experiment (dry run)');
  console.log('================================================');
  console.log('No API writes are performed in plan mode.');
  console.log(`State: ${state ? `${state.status} run ${state.runId}` : 'none'}`);
  console.log(`State path: ${path.replace(`${process.cwd()}/`, '')}`);
  console.log('\nApply creates an isolated catalog and fresh customers to test:');
  console.log('- Q1 priority values, lower-number ordering, and expiry tiebreaking');
  console.log('- Q2 contract edit credit grants');
  console.log('- Q4 invoices without a billing provider');
  console.log('- Q5 edit uniqueness and Idempotency-Key behavior');
  console.log('- Q6 delayed event timestamp attribution');
  console.log('- Q7 archived-credit fallback');
  console.log('- Q8 mixed valid/invalid ingest batches');
  console.log('- Q12 Metronome operation independent of Stripe');
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
      console.log(`Cleanup preview for run ${state.runId}:`);
      console.log(`- ${state.ids.customerIds.length} customers`);
      console.log(`- ${state.ids.contractIds.length} contracts`);
      console.log('- one metric, two products, and one rate card');
      console.log(
        `Re-run with --cleanup --confirm=${CONFIRMATION} to archive only these IDs.`,
      );
      return;
    }
    await cleanup(client, path, state);
    return;
  }
  if (args.action === 'check') {
    if (!state || state.status === 'cleaned') {
      throw new Error('No active experiment exists. Run with --apply first.');
    }
    await refreshBalanceEvidence(client, path, state);
    printFindings(state);
    return;
  }
  if (state && state.status !== 'cleaned') {
    throw new Error(
      `Experiment run ${state.runId} is ${state.status}. Clean it before starting another run.`,
    );
  }
  state = newState();
  await save(path, state);
  try {
    const creditTypeId = await ensureCatalog(client, path, state);
    // Fresh metrics, products, and rates can take a few seconds to become
    // available to the usage-rating path even though their create calls have
    // returned. Without this grace period the first accepted event can remain
    // temporarily unrated and produce misleading priority evidence.
    console.log('Waiting 10 seconds for catalog propagation.');
    await new Promise((resolveWait) => setTimeout(resolveWait, 10_000));
    await testPriority(client, path, state, creditTypeId);
    await testEditsAndIdempotency(apiKey, client, path, state, creditTypeId);
    await testTimestampAndNoProvider(client, path, state, creditTypeId);
    await testArchivedCredit(apiKey, client, path, state, creditTypeId);
    await testInvalidBatch(apiKey, client, path, state, creditTypeId);
    state.status = 'complete';
    await save(path, state);
    printFindings(state);
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
