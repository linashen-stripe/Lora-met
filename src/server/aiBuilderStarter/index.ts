import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import Metronome from '@metronome/sdk';
import Stripe from 'stripe';
import rawManifest from '../../../config/metronome/ai-builder-starter.json';
import {
  createTraceId,
  safeJsonParse,
  type ApiTraceEntry,
} from '@/utils/apiInspector';
import { DEMO_METRONOME_USAGE_USER_IDS } from '@/config/demoMetronomeUsageSeats';
import { STRIPE_API_VERSION } from '@/utils/stripe';
import {
  assertB2bSeatTargets,
  b2bSeatConsumptionTargets,
  demoB2bContractStart,
  demoB2bUsageStart,
  demoContractStart,
  expectedB2bSpillSeatCount,
  listRateTargetsForConsumption,
  type DemoUsageStory,
} from '@/utils/demoUsageSeedProfiles';
import {
  AI_BUILDER_SEED_EVENT_REVISION,
  SEED_USAGE_MULTI_PROJECT_IDS,
  SEED_USAGE_MULTI_PROJECT_SPEND_SHARES,
  seedMetronomeUsage,
} from '@/utils/metronomeSeedUsage';
import {
  metronomeContractConsumedUnits,
} from '@/utils/metronomeContractPool';
import {
  logStarterResetSummary,
  starterResetCompletionMessage,
} from '@/server/starterResetSummary';
import { createStripeTestCustomer } from '@/server/stripeTestCustomer';

const STARTER_USAGE_AGGREGATION_TIMEOUT_MS = 30_000;
const STARTER_USAGE_AGGREGATION_POLL_MS = 5_000;

export type AiBuilderMetricKey =
  | 'code_assist_input'
  | 'code_assist_output'
  | 'chat_input'
  | 'chat_output'
  | 'voice_input'
  | 'voice_output';

type StarterManifest = {
  version: number;
  namespace: string;
  resourcePrefix: string;
  eventType: 'ai_platform.usage';
  fiatCurrency: 'USD';
  rateCard: { name: string; alias: string };
  metrics: Array<{
    key: AiBuilderMetricKey;
    name: string;
    apiProduct: 'code_assist' | 'chat' | 'realtime_voice';
    aggregationKey: 'input_tokens' | 'output_tokens';
  }>;
  rates: Array<{
    metric: AiBuilderMetricKey;
    model: string;
    processingTier: 'standard' | 'batch';
    centsPerMillionTokens: number;
  }>;
  products: {
    trialCredit: string;
    prepaidCommit: string;
    seatCredit: string;
    proSubscription: string;
    enterpriseSubscription: string;
  };
  packages: {
    free: { name: string; creditCents: number };
    pro: {
      name: string;
      monthlyPriceCents: number;
      monthlyCreditCents: number;
    };
    quickstart: {
      name: string;
      prepaidCents: number;
      durationMonths: number;
    };
  };
  powerUser: {
    contractName: string;
    annualCommitCents: number;
    durationMonths: number;
    seatCount: number;
    seatMonthlyPriceCents: number;
    seatMonthlyCreditCents: number;
    usageMultiplier: number;
  };
  personas: Array<{
    key: 'pro' | 'enterprise-quickstart' | 'b2b-power-user';
    name: string;
    package?: 'pro' | 'quickstart';
    directContract?: 'power-user';
  }>;
};

export const AI_BUILDER_STARTER_MANIFEST =
  rawManifest as StarterManifest;

function applyStarterOverrides(
  source: StarterManifest,
  options: AiBuilderStarterOptions,
): StarterManifest {
  const prefix = options.resourcePrefix?.trim() || source.resourcePrefix;
  const rename = (name: string) =>
    name.startsWith(`${source.resourcePrefix} - `)
      ? `${prefix}${name.slice(source.resourcePrefix.length)}`
      : name;
  const personaNames: Record<string, string | undefined> = {
    pro: options.proName?.trim(),
    'enterprise-quickstart': options.quickstartName?.trim(),
    'b2b-power-user': options.powerUserName?.trim(),
  };
  return {
    ...source,
    resourcePrefix: prefix,
    rateCard: {
      name: rename(source.rateCard.name),
      alias: `${prefix
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')}-ai-builder-v${source.version}`,
    },
    metrics: source.metrics.map((metric) => ({
      ...metric,
      name: rename(metric.name),
    })),
    products: Object.fromEntries(
      Object.entries(source.products).map(([key, name]) => [
        key,
        rename(name),
      ]),
    ) as StarterManifest['products'],
    powerUser: {
      ...source.powerUser,
      contractName: `${prefix} B2B Power User`,
    },
    personas: source.personas.map((persona) => ({
      ...persona,
      name: personaNames[persona.key] || persona.name,
    })),
  };
}

type StarterState = {
  apiKeyFingerprint: string;
  namespace: string;
  manifestVersion: number;
  resourcePrefix: string;
  runId: string;
  billingMode: 'metronome-only' | 'stripe';
  generatedAt: string;
  checkpoints: string[];
  metricIds?: Record<string, string>;
  productIds?: Record<string, string>;
  rateCardId?: string;
  packageIds?: Record<string, string>;
  customerIds?: Record<string, string>;
  contractIds?: Record<string, string>;
  stripeAccountId?: string;
  stripeCustomerIds?: Record<string, string>;
  billingConfigurationIds?: Record<string, string>;
  lastError?: string;
};

export interface AiBuilderStarterOptions {
  apiKey: string;
  mode?: 'plan' | 'seed' | 'reset';
  resetScope?: 'demo-only' | 'demo-data' | 'full';
  confirmReset?: boolean;
  resourcePrefix?: string;
  quickstartName?: string;
  proName?: string;
  powerUserName?: string;
  stripeSecretKey?: string;
  deliveryMethodId?: string;
  stateDirectory?: string;
  onLog?: (line: string) => void;
  onTrace?: (entry: ApiTraceEntry) => void;
}

export interface AiBuilderStarterResult {
  mode: 'plan' | 'seed' | 'reset-preview' | 'reset';
  statePath: string;
  summary: Record<string, unknown>;
}

type Catalog = {
  fiatCreditTypeId: string;
  metricIds: Record<string, string>;
  productIds: Record<string, string>;
  rateCardId: string;
  packageIds: Record<string, string>;
};

type StripeContext = {
  stripe: Stripe;
  accountId: string;
  deliveryMethod: string;
  deliveryMethodId?: string;
};

const METRIC_KEYS = new Set<AiBuilderMetricKey>(
  AI_BUILDER_STARTER_MANIFEST.metrics.map((metric) => metric.key),
);

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function scopedKey(
  manifest: StarterManifest,
  kind: string,
  name: string,
  runId: string,
): string {
  return `${manifest.namespace}:${kind}:${name}:v${manifest.version}:run-${runId}`;
}

function statePath(options: AiBuilderStarterOptions): string {
  return resolve(
    options.stateDirectory ?? resolve(process.cwd(), '.metronome/ai-builder-starter'),
    fingerprint(options.apiKey.trim()),
    'state.json',
  );
}

async function readState(path: string): Promise<StarterState | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as StarterState;
  } catch {
    return null;
  }
}

async function writeState(path: string, state: StarterState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`);
}

async function listAll<T>(source: AsyncIterable<T>): Promise<T[]> {
  const rows: T[] = [];
  for await (const row of source) rows.push(row);
  return rows;
}

function reviewConfig(manifest: StarterManifest) {
  const names = [
    manifest.resourcePrefix,
    manifest.rateCard.name,
    ...manifest.metrics.map(({ name }) => name),
    ...Object.values(manifest.products),
    ...manifest.rates.map(({ model }) => model),
  ];
  const errors: string[] = [];
  if (!manifest.resourcePrefix.trim()) {
    errors.push('Resource prefix is required.');
  }
  if (names.some((name) => /\blora\b/i.test(name))) {
    errors.push('Resource and model names must not contain "Lora".');
  }
  if (manifest.eventType !== 'ai_platform.usage') {
    errors.push('Event type must be ai_platform.usage.');
  }
  if (manifest.metrics.length !== 6 || METRIC_KEYS.size !== 6) {
    errors.push('Exactly six AI token billable metrics are required.');
  }
  if (
    manifest.packages.free.creditCents !== 500 ||
    manifest.packages.pro.monthlyPriceCents !== 2_000 ||
    manifest.packages.pro.monthlyCreditCents !== 2_000 ||
    manifest.packages.quickstart.prepaidCents !== 250_000 ||
    manifest.packages.quickstart.durationMonths !== 12
  ) {
    errors.push('Package economics do not match the AI Builder requirements.');
  }
  const b2b = manifest.powerUser;
  if (
    b2b.annualCommitCents !== 10_000_000 ||
    b2b.seatCount !== 5 ||
    b2b.seatMonthlyPriceCents !== 200_000 ||
    b2b.seatMonthlyCreditCents !== 200_000 ||
    b2b.usageMultiplier !== 0.85
  ) {
    errors.push('B2B economics do not match the AI Builder requirements.');
  }
  return {
    valid: errors.length === 0,
    errors,
    namespace: manifest.namespace,
    ownership: {
      uniquenessKeyPrefix: `${manifest.namespace}:`,
      customerAliasPrefix: `${manifest.namespace}:customer:`,
      resourceTag: manifest.namespace,
    },
    metrics: manifest.metrics,
    rates: manifest.rates,
    packages: manifest.packages,
    powerUser: manifest.powerUser,
  };
}

export function reviewAiBuilderStarterConfig() {
  return reviewConfig(AI_BUILDER_STARTER_MANIFEST);
}

function assertConfig(manifest: StarterManifest): void {
  const review = reviewConfig(manifest);
  if (!review.valid) throw new Error(review.errors.join(' '));
}

function tracedFetch(
  sink?: (entry: ApiTraceEntry) => void,
): typeof fetch {
  if (!sink) return globalThis.fetch.bind(globalThis);
  return async (input, init) => {
    const id = createTraceId('metronome');
    const startedAt = new Date().toISOString();
    const started = Date.now();
    const url = typeof input === 'string' ? input : input.toString();
    try {
      const response = await fetch(input, init);
      sink({
        id,
        source: 'metronome',
        method: String(init?.method ?? 'GET').toUpperCase(),
        url,
        startedAt,
        durationMs: Date.now() - started,
        status: response.status,
        state: response.ok ? 'success' : 'error',
        request: safeJsonParse(init?.body),
        response: await response.clone().text().then(safeJsonParse),
      });
      return response;
    } catch (error) {
      sink({
        id,
        source: 'metronome',
        method: String(init?.method ?? 'GET').toUpperCase(),
        url,
        startedAt,
        durationMs: Date.now() - started,
        state: 'error',
        request: safeJsonParse(init?.body),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}

function traceStripe(
  stripe: Stripe,
  sink?: (entry: ApiTraceEntry) => void,
): void {
  if (!sink) return;
  stripe.on('response', (event) => {
    sink({
      id: createTraceId('stripe'),
      source: 'stripe',
      method: String(event.method ?? 'GET').toUpperCase(),
      url: `https://api.stripe.com${event.path ?? ''}`,
      startedAt: new Date(
        Number(event.request_start_time ?? Date.now()),
      ).toISOString(),
      durationMs: Number(event.elapsed ?? 0),
      status: Number(event.status ?? 0),
      state: Number(event.status ?? 0) >= 400 ? 'error' : 'success',
      response: { requestId: event.request_id, apiVersion: event.api_version },
    });
  });
}

async function resolveFiatCreditType(client: any): Promise<string> {
  const available: string[] = [];
  for await (const unit of client.v1.pricingUnits.list()) {
    if (!unit.is_currency) continue;
    available.push(unit.name ?? unit.id);
    const code = String(unit.currency_code ?? '').toUpperCase();
    const names = String(unit.name ?? '')
      .toUpperCase()
      .split(/[^A-Z]+/);
    if (code === 'USD' || names.includes('USD')) return unit.id;
  }
  throw new Error(
    `No USD fiat pricing unit exists. Currency units: ${available.join(', ') || 'none'}.`,
  );
}

function metricGroupKeys(): string[][] {
  return [
    [
      'model',
      'processing_tier',
      'workspace_id',
      'project_id',
      'user_id',
    ],
  ];
}

function pricingGroupKey(): string[] {
  return ['model', 'processing_tier'];
}

async function discover(client: any) {
  const [metrics, products, rateCards, packages, customers] = await Promise.all([
    listAll<any>(client.v1.billableMetrics.list()),
    listAll<any>(
      client.v1.contracts.products.list({ archive_filter: 'NOT_ARCHIVED' }),
    ),
    listAll<any>(client.v1.contracts.rateCards.list({ body: {} })),
    listAll<any>(client.v1.packages.list()),
    listAll<any>(client.v1.customers.list()),
  ]);
  return { metrics, products, rateCards, packages, customers };
}

function assertEquivalent(
  label: string,
  actual: unknown,
  expected: unknown,
): void {
  if (stable(actual) !== stable(expected)) {
    throw new Error(
      `${label} has an incompatible definition. A full reset is required before changing catalog dimensions or rates.`,
    );
  }
}

async function ensureCatalog(
  client: any,
  manifest: StarterManifest,
  runId: string,
  knownPackageIds: Record<string, string>,
  deliveryMethod: string | undefined,
  log: (message: string) => void,
): Promise<Catalog> {
  const found = await discover(client);
  const fiatCreditTypeId = await resolveFiatCreditType(client);
  const metricIds: Record<string, string> = {};

  for (const definition of manifest.metrics) {
    const groupKeys = metricGroupKeys();
    const propertyFilters = [
      { name: definition.aggregationKey, exists: true },
      {
        name: 'api_product',
        exists: true,
        in_values: [definition.apiProduct],
      },
      { name: 'model', exists: true },
      { name: 'processing_tier', exists: true },
      { name: 'workspace_id', exists: true },
      { name: 'project_id', exists: true },
      { name: 'user_id', exists: true },
    ];
    const existing = found.metrics.find(
      (metric: any) => metric.name === definition.name,
    );
    if (existing) {
      assertEquivalent(`${definition.name} group keys`, existing.group_keys ?? [], groupKeys);
      assertEquivalent(
        `${definition.name} property filters`,
        [...(existing.property_filters ?? [])].sort((a: any, b: any) =>
          a.name.localeCompare(b.name),
        ),
        [...propertyFilters].sort((a, b) => a.name.localeCompare(b.name)),
      );
      metricIds[definition.key] = existing.id;
      continue;
    }
    log(`Creating billable metric: ${definition.name}`);
    const created = await client.v1.billableMetrics.create({
      name: definition.name,
      aggregation_type: 'SUM',
      aggregation_key: definition.aggregationKey,
      event_type_filter: { in_values: [manifest.eventType] },
      property_filters: propertyFilters,
      group_keys: groupKeys,
    });
    metricIds[definition.key] = created.data.id;
  }

  const productsByName = new Map(
    found.products.map((product: any) => [product.current.name, product]),
  );
  const productIds: Record<string, string> = {};
  for (const metric of manifest.metrics) {
    const existing: any = productsByName.get(metric.name);
    const pricing = pricingGroupKey();
    if (existing) {
      const existingTags = existing.current.tags ?? [];
      if (!existingTags.includes(manifest.namespace)) {
        throw new Error(
          `Product "${metric.name}" exists without the ${manifest.namespace} ownership tag.`,
        );
      }
      assertEquivalent(
        `${metric.name} billable metric`,
        existing.current.billable_metric_id,
        metricIds[metric.key],
      );
      assertEquivalent(
        `${metric.name} pricing group key`,
        existing.current.pricing_group_key,
        pricing,
      );
      assertEquivalent(
        `${metric.name} quantity conversion`,
        existing.current.quantity_conversion,
        {
          conversion_factor: 1_000_000,
          operation: 'divide',
          name: 'tokens to million tokens',
        },
      );
      if (!existingTags.includes('usage')) {
        log(`Adding required usage tag: ${metric.name}`);
        await client.v1.contracts.products.update({
          product_id: existing.id,
          starting_at: contractStart(),
          tags: [...existingTags, 'usage'],
        });
      }
      productIds[metric.key] = existing.id;
      continue;
    }
    log(`Creating usage product: ${metric.name}`);
    const created = await client.v1.contracts.products.create({
      name: metric.name,
      type: 'USAGE',
      billable_metric_id: metricIds[metric.key],
      quantity_conversion: {
        conversion_factor: 1_000_000,
        operation: 'divide',
        name: 'tokens to million tokens',
      },
      pricing_group_key: pricing,
      presentation_group_key: ['project_id', 'user_id'],
      tags: [manifest.namespace, 'usage'],
    });
    productIds[metric.key] = created.data.id;
  }

  const fixedProducts = [
    ['trialCredit', manifest.products.trialCredit, 'FIXED'],
    ['prepaidCommit', manifest.products.prepaidCommit, 'FIXED'],
    ['seatCredit', manifest.products.seatCredit, 'FIXED'],
    ['proSubscription', manifest.products.proSubscription, 'SUBSCRIPTION'],
    [
      'enterpriseSubscription',
      manifest.products.enterpriseSubscription,
      'SUBSCRIPTION',
    ],
  ] as const;
  for (const [key, name, type] of fixedProducts) {
    const existing: any = productsByName.get(name);
    if (existing) {
      if (!(existing.current.tags ?? []).includes(manifest.namespace)) {
        throw new Error(
          `Product "${name}" exists without the ${manifest.namespace} ownership tag.`,
        );
      }
      productIds[key] = existing.id;
      continue;
    }
    log(`Creating ${type.toLowerCase()} product: ${name}`);
    const created = await client.v1.contracts.products.create({
      name,
      type,
      tags: [manifest.namespace],
    });
    productIds[key] = created.data.id;
  }

  let rateCard = found.rateCards.find(
    (candidate: any) => candidate.name === manifest.rateCard.name,
  );
  if (!rateCard) {
    log(`Creating rate card: ${manifest.rateCard.name}`);
    rateCard = (
      await client.v1.contracts.rateCards.create({
        name: manifest.rateCard.name,
        description: 'AI Builder USD token pricing owned by the starter engine.',
        aliases: [{ name: `${manifest.rateCard.alias}-${runId}` }],
        fiat_credit_type_id: fiatCreditTypeId,
      })
    ).data;
  }
  const rateCardId = rateCard.id;
  const currentRates = await listAll<any>(
    client.v1.contracts.rateCards.rates.list({
      rate_card_id: rateCardId,
      at: new Date().toISOString(),
    }),
  );
  const ratesToAdd: any[] = [];
  for (const rate of manifest.rates) {
    const values = {
      model: rate.model,
      processing_tier: rate.processingTier,
    };
    const existing = currentRates.find(
      (candidate) =>
        candidate.product_id === productIds[rate.metric] &&
        stable(candidate.pricing_group_values ?? {}) === stable(values),
    );
    if (existing) {
      assertEquivalent(
        `${rate.metric}/${rate.model}/${rate.processingTier} price`,
        Number(existing.rate?.price),
        rate.centsPerMillionTokens,
      );
    } else {
      ratesToAdd.push({
        product_id: productIds[rate.metric],
        rate_type: 'FLAT',
        price: rate.centsPerMillionTokens,
        credit_type_id: fiatCreditTypeId,
        pricing_group_values: values,
        starting_at: '2020-01-01T00:00:00.000Z',
        entitled: true,
      });
    }
  }
  const subscriptionRates = [
    {
      productId: productIds.proSubscription,
      price: manifest.packages.pro.monthlyPriceCents,
    },
    {
      productId: productIds.enterpriseSubscription,
      price: manifest.powerUser.seatMonthlyPriceCents,
    },
  ];
  for (const subscription of subscriptionRates) {
    const existing = currentRates.find(
      (candidate) =>
        candidate.product_id === subscription.productId &&
        String(candidate.billing_frequency).toUpperCase() === 'MONTHLY',
    );
    if (existing) {
      assertEquivalent(
        `Subscription ${subscription.productId} price`,
        Number(existing.rate?.price),
        subscription.price,
      );
    } else {
      ratesToAdd.push({
        product_id: subscription.productId,
        rate_type: 'FLAT',
        price: subscription.price,
        credit_type_id: fiatCreditTypeId,
        billing_frequency: 'MONTHLY',
        starting_at: '2020-01-01T00:00:00.000Z',
        entitled: true,
      });
    }
  }
  if (ratesToAdd.length) {
    log(`Adding ${ratesToAdd.length} rate-card rates.`);
    await client.v1.contracts.rateCards.rates.addMany({
      rate_card_id: rateCardId,
      rates: ratesToAdd,
    });
  }

  const usageProductIds = manifest.metrics.map(
    (metric) => productIds[metric.key],
  );
  const packageIds: Record<string, string> = {};
  const packageDefinitions = [
    {
      key: 'free',
      name: manifest.packages.free.name,
      body: {
        credits: [
          {
            product_id: productIds.trialCredit,
            name: 'Trial Credit',
            priority: 1,
            rate_type: 'LIST_RATE',
            applicable_product_ids: usageProductIds,
            access_schedule: {
              credit_type_id: fiatCreditTypeId,
              schedule_items: [
                {
                  amount: manifest.packages.free.creditCents,
                  starting_at_offset: { value: 0, unit: 'DAYS' },
                  duration: { value: 1, unit: 'MONTHS' },
                },
              ],
            },
          },
        ],
      },
    },
    {
      key: 'pro',
      name: manifest.packages.pro.name,
      body: {
        subscriptions: [
          {
            name: 'Pro subscription',
            collection_schedule: 'ADVANCE',
            proration: {
              is_prorated: false,
              invoice_behavior: 'BILL_IMMEDIATELY',
            },
            subscription_rate: {
              billing_frequency: 'MONTHLY',
              product_id: productIds.proSubscription,
            },
            initial_quantity: 1,
            quantity_management_mode: 'QUANTITY_ONLY',
          },
        ],
        recurring_credits: [
          {
            product_id: productIds.trialCredit,
            name: 'Pro monthly USD credit',
            priority: 1,
            rate_type: 'LIST_RATE',
            applicable_product_ids: usageProductIds,
            recurrence_frequency: 'MONTHLY',
            starting_at_offset: { value: 0, unit: 'DAYS' },
            commit_duration: { value: 1, unit: 'PERIODS' },
            proration: 'NONE',
            access_amount: {
              credit_type_id: fiatCreditTypeId,
              unit_price: manifest.packages.pro.monthlyCreditCents,
              quantity: 1,
            },
          },
        ],
      },
    },
    {
      key: 'quickstart',
      name: manifest.packages.quickstart.name,
      body: {
        duration: {
          value: manifest.packages.quickstart.durationMonths,
          unit: 'MONTHS',
        },
        commits: [
          {
            type: 'PREPAID',
            product_id: productIds.prepaidCommit,
            name: 'Enterprise Quickstart prepaid commitment',
            priority: 1,
            rate_type: 'LIST_RATE',
            applicable_product_ids: usageProductIds,
            access_schedule: {
              credit_type_id: fiatCreditTypeId,
              schedule_items: [
                {
                  amount: manifest.packages.quickstart.prepaidCents,
                  starting_at_offset: { value: 0, unit: 'DAYS' },
                  duration: {
                    value: manifest.packages.quickstart.durationMonths,
                    unit: 'MONTHS',
                  },
                },
              ],
            },
            invoice_schedule: {
              credit_type_id: fiatCreditTypeId,
              schedule_items: [
                {
                  unit_price: manifest.packages.quickstart.prepaidCents,
                  quantity: 1,
                  date_offset: { value: 0, unit: 'DAYS' },
                },
              ],
            },
          },
        ],
      },
    },
  ];
  for (const definition of packageDefinitions) {
    let replacedPackageId: string | undefined;
    const owned = found.packages.filter(
      (pkg: any) => {
        if (pkg.archived_at) return false;
        const hasOwnedAlias = (pkg.aliases ?? []).some(
          (alias: { name?: string } | string) =>
            String(
              typeof alias === 'string' ? alias : alias.name ?? '',
            ).startsWith(
              `${manifest.namespace}-package-${definition.key}-`,
            ),
        );
        return (
          knownPackageIds[definition.key] === pkg.id ||
          String(pkg.uniqueness_key ?? '').startsWith(
            `${manifest.namespace}:package:${definition.key}:`,
          ) ||
          hasOwnedAlias ||
          (pkg.name === definition.name && pkg.rate_card_id === rateCardId)
        );
      },
    );
    if (owned.length > 1) {
      throw new Error(
        `Duplicate active starter packages found for ${definition.name}; run a full reset.`,
      );
    }
    if (owned.length === 1) {
      const existing = owned[0];
      if (definition.key === 'quickstart') {
        const detail = await client.v1.packages.retrieve({
          package_id: existing.id,
        });
        const hasInlineStripePaymentGate = (
          (detail.data as any).commits ?? []
        ).some(
          (commit: any) =>
            commit.payment_gate_config?.payment_gate_type === 'STRIPE',
        );
        if (hasInlineStripePaymentGate) {
          log(
            `Replacing incompatible payment-gated package: ${definition.name}`,
          );
          await client.v1.packages.archive({ package_id: existing.id });
          replacedPackageId = existing.id;
        } else {
          packageIds[definition.key] = existing.id;
          continue;
        }
      } else {
        packageIds[definition.key] = existing.id;
        continue;
      }
    }
    const nameConflict = found.packages.find(
      (pkg: any) =>
        !pkg.archived_at &&
        pkg.id !== replacedPackageId &&
        pkg.name === definition.name,
    );
    if (nameConflict) {
      throw new Error(
        `Package "${definition.name}" exists but is not owned by ${manifest.namespace}.`,
      );
    }
    log(`Creating package: ${definition.name}`);
    const created = await client.v1.packages.create({
      name: definition.name,
      contract_name: definition.name,
      rate_card_id: rateCardId,
      billing_anchor_date: 'contract_start_date',
      usage_statement_schedule: {
        frequency: 'MONTHLY',
        day: 'CONTRACT_START',
      },
      uniqueness_key: scopedKey(
        manifest,
        'package',
        definition.key,
        runId,
      ),
      aliases: [
        {
          name: `${manifest.namespace}-package-${definition.key}-${runId}`,
        },
      ],
      ...(deliveryMethod
        ? {
            billing_provider: 'stripe',
            delivery_method: deliveryMethod,
          }
        : {}),
      ...definition.body,
    });
    packageIds[definition.key] = created.data.id;
  }
  return {
    fiatCreditTypeId,
    metricIds,
    productIds,
    rateCardId,
    packageIds,
  };
}

async function preflightStripe(
  client: any,
  secretKey: string,
  requestedDeliveryMethodId: string | undefined,
  onTrace: ((entry: ApiTraceEntry) => void) | undefined,
): Promise<StripeContext> {
  if (!secretKey.startsWith('sk_test_')) {
    throw new Error('Stripe-assisted setup accepts only an sk_test_ key.');
  }
  const stripe = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
  traceStripe(stripe, onTrace);
  const account = await stripe.accounts.retrieve();
  const providers = await client.v1.settings.billingProviders.list({});
  const stripeProviders = (providers.data ?? []).filter(
    (provider: any) => provider.billing_provider === 'stripe',
  );
  const provider = requestedDeliveryMethodId
    ? stripeProviders.find(
        (candidate: any) =>
          candidate.delivery_method_id === requestedDeliveryMethodId,
      )
    : stripeProviders.length === 1
      ? stripeProviders[0]
      : undefined;
  if (!provider) {
    throw new Error(
      stripeProviders.length > 1
        ? 'Multiple Stripe delivery methods exist; deliveryMethodId is required.'
        : 'The selected Stripe delivery method is unavailable.',
    );
  }
  const configuredAccount =
    provider.delivery_method_configuration?.stripe_account_id ??
    provider.configuration?.stripe_account_id;
  if (!configuredAccount || configuredAccount !== account.id) {
    throw new Error(
      `Stripe key account ${account.id} does not match the selected Metronome delivery method (${configuredAccount ?? 'unknown'}).`,
    );
  }
  return {
    stripe,
    accountId: account.id,
    deliveryMethod:
      provider.delivery_method ?? 'direct_to_billing_provider',
    deliveryMethodId: provider.delivery_method_id,
  };
}

async function createStripeCustomer(
  stripe: Stripe,
  persona: StarterManifest['personas'][number],
  namespace: string,
  runId: string,
  email = `${persona.key}.${runId}@example.com`,
): Promise<string> {
  return createStripeTestCustomer(stripe, {
    name: persona.name,
    email,
    metadata: {
      starter_namespace: namespace,
      starter_persona: persona.key,
      starter_run: runId,
    },
  });
}

async function ensureBillingConfiguration(
  client: any,
  customerId: string,
  stripeCustomerId: string,
  stripeContext: StripeContext,
  collectionMethod: 'charge_automatically' | 'send_invoice',
): Promise<string | undefined> {
  const current =
    await client.v1.customers.retrieveBillingConfigurations({
      customer_id: customerId,
    });
  const existing = (current.data ?? []).find(
    (row: any) =>
      !row.archived_at &&
      row.billing_provider === 'stripe' &&
      row.configuration?.stripe_customer_id === stripeCustomerId,
  );
  if (existing) return existing.id;
  const base = {
    customer_id: customerId,
    billing_provider: 'stripe',
    ...(stripeContext.deliveryMethodId
      ? { delivery_method_id: stripeContext.deliveryMethodId }
      : { delivery_method: stripeContext.deliveryMethod }),
    configuration: {
      stripe_customer_id: stripeCustomerId,
      stripe_collection_method: collectionMethod,
    },
  };
  try {
    await client.v1.customers.setBillingConfigurations({
      data: [{ ...base, tax_provider: 'stripe' }],
    });
  } catch (error) {
    if (!/tax_provider is not enabled/i.test(String(error))) throw error;
    await client.v1.customers.setBillingConfigurations({ data: [base] });
  }
  const refreshed =
    await client.v1.customers.retrieveBillingConfigurations({
      customer_id: customerId,
    });
  return (refreshed.data ?? []).find(
    (row: any) =>
      !row.archived_at &&
      row.configuration?.stripe_customer_id === stripeCustomerId,
  )?.id;
}

function contractStart(): string {
  return demoContractStart().toISOString();
}

async function ensureProAutoTopUp(
  client: any,
  customerId: string,
  contractId: string,
  catalog: Catalog,
  stripeEnabled: boolean,
): Promise<void> {
  const retrieved = await client.v2.contracts.retrieve({
    customer_id: customerId,
    contract_id: contractId,
    include_balance: true,
  });
  if (
    (retrieved.data as any).prepaid_balance_threshold_configuration?.is_enabled
  ) {
    return;
  }
  await client.v2.contracts.edit({
    customer_id: customerId,
    contract_id: contractId,
    add_prepaid_balance_threshold_configuration: {
      is_enabled: true,
      threshold_amount: 500,
      recharge_to_amount: 1_500,
      payment_gate_config: {
        payment_gate_type: stripeEnabled ? 'STRIPE' : 'NONE',
        ...(stripeEnabled
          ? { stripe_config: { payment_type: 'INVOICE' } }
          : {}),
      },
      commit: {
        product_id: catalog.productIds.prepaidCommit,
        name: 'Seeded Pro Auto Top-Up',
        applicable_product_ids: AI_BUILDER_STARTER_MANIFEST.metrics.map(
          (metric) => catalog.productIds[metric.key],
        ),
      },
    },
  } as any);
}

async function ensurePersonas(
  client: any,
  manifest: StarterManifest,
  catalog: Catalog,
  runId: string,
  stripeContext: StripeContext | undefined,
  stripeCustomerIds: Record<string, string>,
  log: (message: string) => void,
  customerAliases: Record<string, string> = {},
) {
  const found = await discover(client);
  const customerIds: Record<string, string> = {};
  const contractIds: Record<string, string> = {};
  const billingConfigurationIds: Record<string, string> = {};
  const packageStartingAt = contractStart();

  for (const persona of manifest.personas) {
    const startingAt = persona.directContract
      ? demoB2bContractStart().toISOString()
      : packageStartingAt;
    const explicitAlias = customerAliases[persona.key];
    const alias =
      explicitAlias ??
      `${manifest.namespace}:customer:${persona.key}:run-${runId}`;
    const ownedCustomers = found.customers.filter(
      (customer: any) =>
        !customer.archived_at &&
        (customer.ingest_aliases ?? []).some((candidate: string) =>
          explicitAlias
            ? candidate === explicitAlias
            : candidate.startsWith(
                `${manifest.namespace}:customer:${persona.key}:`,
              ),
        ),
    );
    if (ownedCustomers.length > 1) {
      throw new Error(
        `Duplicate active starter customers found for ${persona.name}; reset before retrying.`,
      );
    }
    let customer = ownedCustomers[0];
    if (customer && customer.name !== persona.name) {
      throw new Error(
        `Starter customer "${customer.name}" already owns the ${persona.key} alias. Run a demo-data reset before changing its name to "${persona.name}".`,
      );
    }
    if (!customer) {
      const conflict = found.customers.find(
        (candidate: any) =>
          !candidate.archived_at && candidate.name === persona.name,
      );
      if (conflict) {
        throw new Error(
          `Customer "${persona.name}" exists without starter ownership.`,
        );
      }
      log(`Creating customer: ${persona.name}`);
      customer = (
        await client.v1.customers.create({
          name: persona.name,
          ingest_aliases: [alias],
        })
      ).data;
    }
    customerIds[persona.key] = customer.id;
    if (stripeContext) {
      billingConfigurationIds[persona.key] =
        (await ensureBillingConfiguration(
          client,
          customer.id,
          stripeCustomerIds[persona.key],
          stripeContext,
          persona.directContract === 'power-user'
            ? 'send_invoice'
            : 'charge_automatically',
        )) ?? '';
    }

    const listed = await client.v2.contracts.list({
      customer_id: customer.id,
      include_archived: false,
    });
    const expectedName = persona.directContract
      ? manifest.powerUser.contractName
      : persona.package
        ? manifest.packages[persona.package].name
        : '';
    const ownedContracts = (listed.data ?? []).filter(
      (contract: any) =>
        String(contract.uniqueness_key ?? '').startsWith(
          `${manifest.namespace}:contract:${persona.key}:`,
        ) ||
        (contract.name === expectedName &&
          contract.rate_card_id === catalog.rateCardId),
    );
    if (ownedContracts.length > 1) {
      throw new Error(
        `Customer "${persona.name}" has duplicate active starter contracts. Reset/review is required.`,
      );
    }
    if (ownedContracts.length === 1) {
      contractIds[persona.key] = ownedContracts[0].id;
      if (persona.key === 'pro') {
        await ensureProAutoTopUp(
          client,
          customer.id,
          ownedContracts[0].id,
          catalog,
          Boolean(stripeContext),
        );
      }
      continue;
    }
    log(`Creating contract: ${persona.name}`);
    const uniquenessKey = scopedKey(
      manifest,
      'contract',
      persona.key,
      runId,
    );
    let created;
    if (persona.package) {
      created = await client.v1.contracts.create({
        customer_id: customer.id,
        package_id: catalog.packageIds[persona.package],
        starting_at: startingAt,
        uniqueness_key: uniquenessKey,
      });
    } else {
      const b2b = manifest.powerUser;
      const ending = new Date(startingAt);
      ending.setUTCMonth(ending.getUTCMonth() + b2b.durationMonths);
      const endingBefore = ending.toISOString();
      const usageIds = manifest.metrics.map(
        (metric) => catalog.productIds[metric.key],
      );
      const seats = Array.from(
        { length: b2b.seatCount },
        (_, index) =>
          DEMO_METRONOME_USAGE_USER_IDS[index] ?? `seat-user-${index + 1}`,
      );
      created = await client.v1.contracts.create({
        customer_id: customer.id,
        starting_at: startingAt,
        ending_before: endingBefore,
        rate_card_id: catalog.rateCardId,
        name: b2b.contractName,
        uniqueness_key: uniquenessKey,
        ...(stripeContext
          ? {
              billing_provider_configuration: {
                billing_provider: 'stripe',
                ...(stripeContext.deliveryMethodId
                  ? { delivery_method_id: stripeContext.deliveryMethodId }
                  : { delivery_method: stripeContext.deliveryMethod }),
              },
            }
          : {}),
        commits: [
          {
            type: 'PREPAID',
            product_id: catalog.productIds.prepaidCommit,
            name: 'B2B annual USD commitment',
            priority: 100,
            rate_type: 'LIST_RATE',
            applicable_product_ids: usageIds,
            access_schedule: {
              credit_type_id: catalog.fiatCreditTypeId,
              schedule_items: [
                {
                  amount: b2b.annualCommitCents,
                  starting_at: startingAt,
                  ending_before: endingBefore,
                },
              ],
            },
            invoice_schedule: {
              credit_type_id: catalog.fiatCreditTypeId,
              schedule_items: [
                {
                  timestamp: startingAt,
                  unit_price: b2b.annualCommitCents,
                  quantity: 1,
                },
              ],
            },
          },
        ],
        overrides: [
          {
            starting_at: startingAt,
            applicable_product_tags: ['usage'],
            type: 'MULTIPLIER',
            multiplier: b2b.usageMultiplier,
          },
        ],
        subscriptions: [
          {
            name: 'B2B power-user seats',
            collection_schedule: 'advance',
            starting_at: startingAt,
            ending_before: endingBefore,
            proration: {
              is_prorated: false,
              invoice_behavior: 'bill_on_next_collection_date',
            },
            subscription_rate: {
              billing_frequency: 'monthly',
              product_id: catalog.productIds.enterpriseSubscription,
            },
            quantity_management_mode: 'SEAT_BASED',
            seat_config: {
              initial_seat_ids: seats,
              seat_group_key: 'user_id',
            },
            temporary_id: 'power_user_seats',
          },
        ],
        recurring_credits: [
          {
            product_id: catalog.productIds.seatCredit,
            name: 'Monthly per-seat USD credit',
            priority: 1,
            rate_type: 'LIST_RATE',
            applicable_product_ids: usageIds,
            starting_at: startingAt,
            ending_before: endingBefore,
            recurrence_frequency: 'MONTHLY',
            commit_duration: { value: 1, unit: 'PERIODS' },
            proration: 'NONE',
            rollover_fraction: 0,
            access_amount: {
              credit_type_id: catalog.fiatCreditTypeId,
              unit_price: b2b.seatMonthlyCreditCents,
            },
            subscription_config: {
              subscription_id: 'power_user_seats',
              allocation: 'INDIVIDUAL',
              apply_seat_increase_config: { is_prorated: false },
            },
          },
        ],
      });
    }
    contractIds[persona.key] = created.data.id;
    if (persona.key === 'pro') {
      await ensureProAutoTopUp(
        client,
        customer.id,
        created.data.id,
        catalog,
        Boolean(stripeContext),
      );
    }
  }
  return { customerIds, contractIds, billingConfigurationIds };
}

async function seedUsage(
  client: any,
  manifest: StarterManifest,
  customerIds: Record<string, string>,
  contractIds: Record<string, string>,
  log: (message: string) => void,
  story: DemoUsageStory = 'healthy',
): Promise<{
  eventsIngested: number;
  expectedConsumptionCents: Record<string, number>;
}> {
  const projects = SEED_USAGE_MULTI_PROJECT_IDS.map((projectId, index) => ({
    projectId,
    spendShare: SEED_USAGE_MULTI_PROJECT_SPEND_SHARES[index]!,
  }));
  let eventsIngested = 0;
  const expectedConsumptionCents: Record<string, number> = {};

  for (const persona of manifest.personas) {
    const isB2b = persona.key === 'b2b-power-user';
    const customerId = customerIds[persona.key];
    const contractId = contractIds[persona.key];
    if (!customerId || !contractId) {
      throw new Error(`Missing seeded ${persona.key} customer or contract.`);
    }
    const b2bConsumptionTargets = isB2b
      ? b2bSeatConsumptionTargets(
          manifest.powerUser.seatMonthlyCreditCents,
          story,
        )
      : [];
    if (isB2b) {
      assertB2bSeatTargets(
        manifest.powerUser.seatMonthlyCreditCents,
        b2bConsumptionTargets,
        expectedB2bSpillSeatCount(story),
      );
      log(
        `Expected post-discount B2B seat consumption: ${b2bConsumptionTargets
          .map((target) => `$${(target / 100).toFixed(2)}`)
          .join(', ')}.`,
      );
    }
    const result = await seedMetronomeUsage({
      metronome: client,
      customerId,
      contractId,
      story,
      logLabel: `[ai-builder-starter:${persona.key}]`,
      trailingUnseededDays: 1,
      ...(isB2b
        ? {
            seedStartOverride: demoB2bUsageStart(),
            perUserTargetSpendDollars: listRateTargetsForConsumption(
              b2bConsumptionTargets.map((target) => target / 100),
              manifest.powerUser.usageMultiplier,
            ),
            usageUserIds: [
              ...DEMO_METRONOME_USAGE_USER_IDS.slice(
                0,
                manifest.powerUser.seatCount,
              ),
            ],
          }
        : {
            persona:
              persona.key === 'pro'
                ? ('pro' as const)
                : ('quickstart' as const),
          }),
      projectAttribution: { mode: 'multi', projects },
      transactionIdPrefix: 'seed-mp',
      seedRunKey: `${contractId}:${AI_BUILDER_SEED_EVENT_REVISION}`,
    });
    if (!result.ok) throw new Error(result.error);
    eventsIngested += result.eventsIngested;
    expectedConsumptionCents[persona.key] = isB2b
      ? Math.round(
          b2bConsumptionTargets.reduce((sum, target) => sum + target, 0),
        )
      : Math.round(result.estimatedSpendDollars * 100);
    log(
      `Seeded ${persona.key}: ${result.eventsIngested} shared-profile events (${result.estimatedSpendDollars.toFixed(2)} ${result.currency.toUpperCase()} list-rate spend).`,
    );
  }
  return { eventsIngested, expectedConsumptionCents };
}

async function waitForSeededBalances(
  client: any,
  customerIds: Record<string, string>,
  contractIds: Record<string, string>,
  expectedConsumptionCents: Record<string, number>,
  log: (message: string) => void,
): Promise<void> {
  const deadline = Date.now() + STARTER_USAGE_AGGREGATION_TIMEOUT_MS;
  let firstCheck = true;

  while (Date.now() < deadline) {
    if (!firstCheck) {
      await new Promise((resolveWait) =>
        setTimeout(resolveWait, STARTER_USAGE_AGGREGATION_POLL_MS),
      );
    }
    firstCheck = false;

    const statuses = await Promise.all(
      Object.entries(expectedConsumptionCents).map(
        async ([personaKey, expected]) => {
          const retrieved = await client.v2.contracts.retrieve({
            customer_id: customerIds[personaKey],
            contract_id: contractIds[personaKey],
            include_balance: true,
          });
          const contract = retrieved.data ?? retrieved;
          const consumed = metronomeContractConsumedUnits(contract);
          return {
            personaKey,
            expected,
            consumed: consumed ?? 0,
            ready:
              consumed != null &&
              consumed >= Math.floor(expected * 0.98),
          };
        },
      ),
    );

    if (statuses.every((status) => status.ready)) {
      log(
        `Metronome balances aggregated: ${statuses
          .map(
            ({ personaKey, consumed, expected }) =>
              `${personaKey} $${(consumed / 100).toFixed(2)}/$${(
                expected / 100
              ).toFixed(2)}`,
          )
          .join(', ')}.`,
      );
      return;
    }
  }

  throw new Error(
    'Metronome accepted seeded usage but did not aggregate the expected balances within 30 seconds. Setup remains incomplete; retry after Metronome finishes processing.',
  );
}

async function settleInvoicesBestEffort(
  stripe: Stripe,
  customerIds: Record<string, string>,
  createdAfter: number,
  log: (message: string) => void,
): Promise<void> {
  await new Promise((resolveWait) => setTimeout(resolveWait, 2_000));
  for (const customerId of Object.values(customerIds)) {
    try {
      const invoices = await stripe.invoices.list({
        customer: customerId,
        created: { gte: createdAfter },
        limit: 20,
      });
      for (const invoice of invoices.data) {
        let current = invoice;
        if (current.status === 'draft') {
          current = await stripe.invoices.finalizeInvoice(current.id);
        }
        if (current.status === 'open') {
          await stripe.invoices.pay(current.id, { off_session: true });
        }
      }
    } catch (error) {
      log(
        `Stripe invoice settlement deferred for ${customerId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

async function resetOwned(
  client: any,
  manifest: StarterManifest,
  state: StarterState | null,
  scope: 'demo-only' | 'full',
  confirmed: boolean,
  stripeContext: StripeContext | undefined,
  log: (message: string) => void,
) {
  const found = await discover(client);
  const customers = found.customers.filter(
    (customer: any) =>
      !customer.archived_at &&
      (customer.ingest_aliases ?? []).some((alias: string) =>
        alias.startsWith(`${manifest.namespace}:customer:`),
      ),
  );
  const contracts: Array<{ customerId: string; id: string }> = [];
  for (const customer of customers) {
    const listed = await client.v2.contracts.list({
      customer_id: customer.id,
      include_archived: false,
    });
    for (const contract of listed.data ?? []) {
      // The customer alias is the ownership boundary. Package-provisioned
      // contracts do not consistently expose the requested uniqueness key, so
      // reset must remove every active contract before archiving this
      // starter-owned customer, matching the Generation starter.
      contracts.push({ customerId: customer.id, id: contract.id });
    }
  }
  const ownedPackageIds = new Set(Object.values(state?.packageIds ?? {}));
  const packages = found.packages.filter(
    (pkg: any) =>
      !pkg.archived_at &&
      (ownedPackageIds.has(pkg.id) ||
        String(pkg.uniqueness_key ?? '').startsWith(
          `${manifest.namespace}:package:`,
        ) ||
        (pkg.aliases ?? []).some((alias: { name?: string } | string) =>
          String(typeof alias === 'string' ? alias : alias.name ?? '').startsWith(
            `${manifest.namespace}-package-`,
          ),
        )),
  );
  const ownedMetricIds = new Set(Object.values(state?.metricIds ?? {}));
  const ownedMetricNames = new Set(
    manifest.metrics.map((metric) => metric.name),
  );
  const metrics = found.metrics.filter(
    (metric: any) =>
      ownedMetricIds.has(metric.id) || ownedMetricNames.has(metric.name),
  );
  const ownedProductIds = new Set(Object.values(state?.productIds ?? {}));
  const products = found.products.filter(
    (product: any) =>
      ownedProductIds.has(product.id) ||
      (product.current.tags ?? []).includes(manifest.namespace),
  );
  const rateCards = found.rateCards.filter(
    (card: any) =>
      (Boolean(state?.rateCardId) && card.id === state?.rateCardId) ||
      card.name === manifest.rateCard.name,
  );
  const summary = {
    scope,
    contracts: contracts.map(({ id }) => ({ id })),
    customers: customers.map(({ id, name }: any) => ({ id, name })),
    packages:
      scope === 'full'
        ? packages.map(({ id, name }: any) => ({ id, name }))
        : [],
    rateCards:
      scope === 'full'
        ? rateCards.map(({ id, name }: any) => ({ id, name }))
        : [],
    products:
      scope === 'full'
        ? products.map(({ id, current }: any) => ({
            id,
            name: current.name,
          }))
        : [],
    metrics:
      scope === 'full'
        ? metrics.map(({ id, name }: any) => ({ id, name }))
        : [],
    stripeCustomers: state?.stripeCustomerIds
      ? Object.values(state.stripeCustomerIds)
      : [],
  };
  logStarterResetSummary(log, {
    confirmed,
    scope: scope === 'demo-only' ? 'demo-data' : 'full',
    summary: {
      contracts: summary.contracts,
      customers: summary.customers,
      packages: summary.packages,
      rateCards: summary.rateCards,
      products: summary.products,
      metrics: summary.metrics,
      stripeCustomerIds: summary.stripeCustomers,
    },
  });
  if (!confirmed) return summary;

  for (const contract of contracts) {
    await client.v1.contracts.archive({
      customer_id: contract.customerId,
      contract_id: contract.id,
      void_invoices: false,
    });
  }
  for (const customer of customers) {
    const aliases = (customer.ingest_aliases ?? []).filter(
      (alias: string) =>
        !alias.startsWith(`${manifest.namespace}:customer:`),
    );
    await client.v1.customers.setIngestAliases({
      customer_id: customer.id,
      ingest_aliases: aliases,
    });
    await client.v1.customers.archive({ id: customer.id });
  }
  if (scope === 'full') {
    for (const pkg of packages) {
      await client.v1.packages.archive({ package_id: pkg.id });
    }
    for (const card of rateCards) {
      await client.v1.contracts.rateCards.archive({ id: card.id });
    }
    for (const product of products) {
      await client.v1.contracts.products.archive({
        product_id: product.id,
      });
    }
    for (const metric of metrics) {
      await client.v1.billableMetrics.archive({ id: metric.id });
    }
  }
  if (stripeContext && state?.stripeCustomerIds) {
    for (const customerId of Object.values(state.stripeCustomerIds)) {
      try {
        await stripeContext.stripe.customers.del(customerId);
      } catch (error: any) {
        if (
          error?.code !== 'resource_missing' &&
          !/no such customer/i.test(String(error?.message ?? ''))
        ) {
          throw error;
        }
      }
    }
  }
  log(
    starterResetCompletionMessage(
      scope === 'demo-only' ? 'demo-data' : 'full',
    ),
  );
  return summary;
}

let running = false;

export type AiBuilderStarterPersona =
  | 'pro'
  | 'enterprise-quickstart'
  | 'b2b-power-user';

export interface PrepareAiBuilderPersonaOptions {
  apiKey: string;
  persona: AiBuilderStarterPersona;
  story: DemoUsageStory;
  customerName: string;
  customerEmail: string;
  stripeSecretKey?: string;
  deliveryMethodId?: string;
  onLog?: (line: string) => void;
  onTrace?: (entry: ApiTraceEntry) => void;
}

export interface PreparedAiBuilderPersona {
  billingMode: 'metronome-only' | 'stripe';
  customerId: string;
  contractId: string;
  stripeCustomerId?: string;
  eventsIngested: number;
}

/** Uses the canonical starter catalog, contract builder, and usage seeder for one Admin persona. */
export async function prepareAiBuilderPersona(
  options: PrepareAiBuilderPersonaOptions,
): Promise<PreparedAiBuilderPersona> {
  if (running) throw new Error('Another AI Builder starter run is active.');
  running = true;
  const log = (message: string) => options.onLog?.(message);
  let createdStripeCustomerId: string | undefined;
  try {
    const apiKey = options.apiKey.trim();
    if (!apiKey) throw new Error('A target Metronome API key is required.');
    if (!options.customerName.trim()) throw new Error('Customer name is required.');
    if (!options.customerEmail.trim()) {
      throw new Error('Customer email is required.');
    }
    const fullManifest = applyStarterOverrides(
      AI_BUILDER_STARTER_MANIFEST,
      { apiKey },
    );
    assertConfig(fullManifest);
    const selected = fullManifest.personas.find(
      (persona) => persona.key === options.persona,
    );
    if (!selected) throw new Error(`Unknown AI Builder persona: ${options.persona}`);
    const runId = randomUUID().slice(0, 12);
    const identity = createHash('sha256')
      .update(options.customerEmail.trim().toLowerCase())
      .digest('hex')
      .slice(0, 16);
    const selectedManifest: StarterManifest = {
      ...fullManifest,
      personas: [{ ...selected, name: options.customerName.trim() }],
    };
    const client: any = new Metronome({
      bearerToken: apiKey,
      fetch: tracedFetch(options.onTrace),
    });
    let stripeContext: StripeContext | undefined;
    const stripeCustomerIds: Record<string, string> = {};
    if (options.stripeSecretKey?.trim()) {
      stripeContext = await preflightStripe(
        client,
        options.stripeSecretKey.trim(),
        options.deliveryMethodId,
        options.onTrace,
      );
      createdStripeCustomerId = await createStripeCustomer(
        stripeContext.stripe,
        selectedManifest.personas[0],
        fullManifest.namespace,
        runId,
        options.customerEmail.trim(),
      );
      stripeCustomerIds[selected.key] = createdStripeCustomerId;
    }
    const catalog = await ensureCatalog(
      client,
      fullManifest,
      runId,
      {},
      stripeContext?.deliveryMethod,
      log,
    );
    const personas = await ensurePersonas(
      client,
      selectedManifest,
      catalog,
      runId,
      stripeContext,
      stripeCustomerIds,
      log,
      {
        [selected.key]: `prepared-persona:ai-builder:${selected.key}:${identity}`,
      },
    );
    const seededUsage = await seedUsage(
      client,
      selectedManifest,
      personas.customerIds,
      personas.contractIds,
      log,
      options.story,
    );
    log('Waiting for Metronome to aggregate the expected seeded balances...');
    await waitForSeededBalances(
      client,
      personas.customerIds,
      personas.contractIds,
      seededUsage.expectedConsumptionCents,
      log,
    );
    if (stripeContext) {
      await settleInvoicesBestEffort(
        stripeContext.stripe,
        stripeCustomerIds,
        Math.floor(Date.now() / 1000) - 300,
        log,
      );
    }
    return {
      billingMode: stripeContext ? 'stripe' : 'metronome-only',
      customerId: personas.customerIds[selected.key],
      contractId: personas.contractIds[selected.key],
      ...(createdStripeCustomerId
        ? { stripeCustomerId: createdStripeCustomerId }
        : {}),
      eventsIngested: seededUsage.eventsIngested,
    };
  } catch (error) {
    if (createdStripeCustomerId && options.stripeSecretKey?.trim()) {
      const stripe = new Stripe(options.stripeSecretKey.trim(), {
        apiVersion: STRIPE_API_VERSION,
      });
      await stripe.customers.del(createdStripeCustomerId).catch(() => undefined);
    }
    throw error;
  } finally {
    running = false;
  }
}

export async function runAiBuilderStarter(
  options: AiBuilderStarterOptions,
): Promise<AiBuilderStarterResult> {
  if (running) throw new Error('Another AI Builder starter run is active.');
  running = true;
  try {
    const log = (message: string) => options.onLog?.(message);
    let manifest = applyStarterOverrides(
      AI_BUILDER_STARTER_MANIFEST,
      options,
    );
    const mode = options.mode ?? 'plan';
    assertConfig(manifest);
    const apiKey = options.apiKey.trim();
    if (!apiKey) throw new Error('A target Metronome API key is required.');
    const path = statePath(options);
    const prior = await readState(path);
    if (
      mode === 'reset' &&
      prior?.resourcePrefix &&
      prior.resourcePrefix !== manifest.resourcePrefix
    ) {
      // A failed catalog run may have created resources before their IDs were
      // checkpointed. Reset with the journaled prefix so those exact-name
      // resources remain discoverable even if the form was edited afterward.
      manifest = applyStarterOverrides(AI_BUILDER_STARTER_MANIFEST, {
        ...options,
        resourcePrefix: prior.resourcePrefix,
      });
    }
    const fullyReset = prior?.checkpoints.includes('reset:full') ?? false;
    if (
      mode === 'seed' &&
      prior?.checkpoints.includes('reset:full-pending-stripe')
    ) {
      throw new Error(
        'The Metronome reset completed, but starter-owned Stripe customers still require cleanup with the matching Stripe test key.',
      );
    }
    if (
      prior &&
      !fullyReset &&
      prior.resourcePrefix !== manifest.resourcePrefix &&
      mode !== 'reset'
    ) {
      throw new Error(
        `Starter state uses prefix "${prior.resourcePrefix}". Run a confirmed full reset before changing it.`,
      );
    }
    const client: any = new Metronome({
      bearerToken: apiKey,
      fetch: tracedFetch(options.onTrace),
    });
    let stripeContext: StripeContext | undefined;
    if (options.stripeSecretKey?.trim()) {
      stripeContext = await preflightStripe(
        client,
        options.stripeSecretKey.trim(),
        options.deliveryMethodId,
        options.onTrace,
      );
      if (
        prior?.stripeAccountId &&
        prior.stripeAccountId !== stripeContext.accountId
      ) {
        throw new Error(
          'The Stripe key does not match the account recorded in starter state.',
        );
      }
    }

    if (mode === 'reset') {
      const scope =
        options.resetScope === 'demo-data'
          ? 'demo-only'
          : (options.resetScope ?? 'demo-only');
      const summary = await resetOwned(
        client,
        manifest,
        prior,
        scope,
        Boolean(options.confirmReset),
        stripeContext,
        log,
      );
      if (options.confirmReset) {
        const remainingStripeCustomerIds = stripeContext
          ? {}
          : (prior?.stripeCustomerIds ?? {});
        const fullResetComplete =
          scope === 'full' &&
          Object.keys(remainingStripeCustomerIds).length === 0;
        await writeState(path, {
          ...(prior ?? {}),
          apiKeyFingerprint: fingerprint(apiKey),
          namespace: manifest.namespace,
          manifestVersion: manifest.version,
          resourcePrefix:
            prior?.resourcePrefix ?? manifest.resourcePrefix,
          runId: prior?.runId ?? randomUUID().slice(0, 12),
          billingMode:
            prior?.billingMode ??
            (stripeContext ? 'stripe' : 'metronome-only'),
          generatedAt: new Date().toISOString(),
          customerIds: {},
          contractIds: {},
          billingConfigurationIds: {},
          stripeCustomerIds: remainingStripeCustomerIds,
          ...(scope === 'full'
            ? {
                metricIds: {},
                productIds: {},
                rateCardId: undefined,
                packageIds: {},
              }
            : {}),
          checkpoints: [
            ...(prior?.checkpoints ?? []),
            fullResetComplete
              ? 'reset:full'
              : scope === 'full'
                ? 'reset:full-pending-stripe'
                : 'reset:demo-only',
          ],
        });
      }
      return {
        mode: options.confirmReset ? 'reset' : 'reset-preview',
        statePath: path,
        summary,
      };
    }

    const found = await discover(client);
    const review = reviewConfig(manifest);
    if (mode === 'plan') {
      return {
        mode: 'plan',
        statePath: path,
        summary: {
          review,
          billingMode: stripeContext ? 'stripe' : 'metronome-only',
          existing: {
            metrics: found.metrics.filter((metric: any) =>
              manifest.metrics.some(({ name }) => name === metric.name),
            ).length,
            products: found.products.filter((product: any) =>
              new Set([
                ...manifest.metrics.map(({ name }) => name),
                ...Object.values(manifest.products),
              ]).has(product.current.name),
            ).length,
            rateCard: found.rateCards.some(
              (card: any) => card.name === manifest.rateCard.name,
            ),
            starterCustomers: found.customers.filter((customer: any) =>
              (customer.ingest_aliases ?? []).some((alias: string) =>
                alias.startsWith(`${manifest.namespace}:customer:`),
              ),
            ).length,
          },
        },
      };
    }

    const requestedBillingMode = stripeContext ? 'stripe' : 'metronome-only';
    if (
      prior?.billingMode &&
      !fullyReset &&
      prior.billingMode !== requestedBillingMode
    ) {
      throw new Error(
        `Starter state uses ${prior.billingMode}; run a full reset before switching to ${requestedBillingMode}.`,
      );
    }
    const priorCheckpoints = prior?.checkpoints ?? [];
    const lastCompletedRun = priorCheckpoints.lastIndexOf('complete');
    const lastReset = Math.max(
      priorCheckpoints.lastIndexOf('reset:demo-only'),
      priorCheckpoints.lastIndexOf('reset:full'),
    );
    const startsNewRun = lastReset > lastCompletedRun;
    const runId =
      prior && !startsNewRun ? prior.runId : randomUUID().slice(0, 12);
    let state: StarterState = {
      apiKeyFingerprint: fingerprint(apiKey),
      namespace: manifest.namespace,
      manifestVersion: manifest.version,
      resourcePrefix: manifest.resourcePrefix,
      runId,
      billingMode: requestedBillingMode,
      generatedAt: new Date().toISOString(),
      checkpoints: ['preflight'],
      stripeAccountId: stripeContext?.accountId,
      stripeCustomerIds: { ...(prior?.stripeCustomerIds ?? {}) },
    };
    await writeState(path, state);
    try {
      if (stripeContext) {
        for (const persona of manifest.personas) {
          let customerId = state.stripeCustomerIds?.[persona.key];
          if (customerId) {
            try {
              const existing =
                await stripeContext.stripe.customers.retrieve(customerId);
              if (existing.deleted) customerId = undefined;
            } catch {
              customerId = undefined;
            }
          }
          if (!customerId) {
            log(`Creating Stripe test customer: ${persona.name}`);
            customerId = await createStripeCustomer(
              stripeContext.stripe,
              persona,
              manifest.namespace,
              runId,
            );
            state.stripeCustomerIds = {
              ...state.stripeCustomerIds,
              [persona.key]: customerId,
            };
            await writeState(path, state);
          }
        }
      }
      const catalog = await ensureCatalog(
        client,
        manifest,
        runId,
        prior?.packageIds ?? {},
        stripeContext?.deliveryMethod,
        log,
      );
      state = {
        ...state,
        metricIds: catalog.metricIds,
        productIds: catalog.productIds,
        rateCardId: catalog.rateCardId,
        packageIds: catalog.packageIds,
        checkpoints: [...state.checkpoints, 'catalog'],
      };
      await writeState(path, state);
      const personas = await ensurePersonas(
        client,
        manifest,
        catalog,
        runId,
        stripeContext,
        state.stripeCustomerIds ?? {},
        log,
      );
      state = {
        ...state,
        customerIds: personas.customerIds,
        contractIds: personas.contractIds,
        billingConfigurationIds: personas.billingConfigurationIds,
        checkpoints: [...state.checkpoints, 'customers-contracts'],
      };
      await writeState(path, state);
      const seededUsage = await seedUsage(
        client,
        manifest,
        personas.customerIds,
        personas.contractIds,
        log,
      );
      log(
        'Waiting for Metronome to aggregate the expected seeded balances...',
      );
      await waitForSeededBalances(
        client,
        personas.customerIds,
        personas.contractIds,
        seededUsage.expectedConsumptionCents,
        log,
      );
      if (stripeContext) {
        await settleInvoicesBestEffort(
          stripeContext.stripe,
          state.stripeCustomerIds ?? {},
          Math.floor(Date.now() / 1000) - 300,
          log,
        );
      }
      state = {
        ...state,
        generatedAt: new Date().toISOString(),
        checkpoints: [...state.checkpoints, 'complete'],
      };
      await writeState(path, state);
      return {
        mode: 'seed',
        statePath: path,
        summary: {
          namespace: manifest.namespace,
          runId,
          billingMode: requestedBillingMode,
          customers: personas.customerIds,
          contracts: personas.contractIds,
          eventsIngested: seededUsage.eventsIngested,
        },
      };
    } catch (error) {
      await writeState(path, {
        ...state,
        generatedAt: new Date().toISOString(),
        checkpoints: [...state.checkpoints, 'failed'],
        lastError: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  } finally {
    running = false;
  }
}
