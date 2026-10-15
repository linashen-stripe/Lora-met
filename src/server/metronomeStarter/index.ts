import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import Metronome from '@metronome/sdk';
import Stripe from 'stripe';
import manifest from '../../../config/metronome/starter-kit.json';
import {
  createTraceId,
  safeJsonParse,
  type ApiTraceEntry,
} from '../../utils/apiInspector';
import {
  attachStripeBillingProviderToContract,
  createMetronomeCustomer,
} from '../../utils/metronome';
import { STRIPE_API_VERSION } from '../../utils/stripe';

const ROOT = process.cwd();
let metronomeFetch: typeof fetch = globalThis.fetch.bind(globalThis);
let emit: (...values: unknown[]) => void = (...values) =>
  console.log(...values);
let traceSink: ((entry: ApiTraceEntry) => void) | undefined;

function enableApiInspectorTracing(): void {
  if (!traceSink) return;
  metronomeFetch = async (input, init) => {
    const id = createTraceId('metronome');
    const startedAt = new Date().toISOString();
    const startedAtMs = Date.now();
    const method = String(init?.method ?? 'GET').toUpperCase();
    const url = typeof input === 'string' ? input : input.toString();
    try {
      const response = await fetch(input, init);
      const responseBody = await response
        .clone()
        .text()
        .then(safeJsonParse)
        .catch(() => undefined);
      const entry: ApiTraceEntry = {
        id,
        source: 'metronome',
        method,
        url,
        startedAt,
        durationMs: Date.now() - startedAtMs,
        status: response.status,
        state: response.ok ? 'success' : 'error',
        request: safeJsonParse(init?.body),
        response: responseBody,
      };
      traceSink?.(entry);
      return response;
    } catch (error) {
      const entry: ApiTraceEntry = {
        id,
        source: 'metronome',
        method,
        url,
        startedAt,
        durationMs: Date.now() - startedAtMs,
        state: 'error',
        request: safeJsonParse(init?.body),
        error: error instanceof Error ? error.message : String(error),
      };
      traceSink?.(entry);
      throw error;
    }
  };
}

type MetricKey = 'image' | 'video' | '3d';
type PackageKey = 'free' | 'quickstart' | 'pro';
export type PricingDimension = {
  propertyKey: string;
  values: Array<{ value: string; multiplier: number }>;
  metrics: MetricKey[];
};
type StarterConfig = {
  version: number;
  namespace: string;
  resourcePrefix: string;
  eventType: string;
  fiatCurrency: string;
  pricingDimension: PricingDimension;
  pricingUnit: { name: string; fiatMinorUnitsPerCustomCredit: number };
  creditPurchases: {
    minimumCredits: number;
    presetCredits: number[];
  };
  rateCard: { name: string; alias: string };
  metrics: Array<{
    key: MetricKey;
    name: string;
    modality: string;
    unit: 'jobs' | 'seconds';
  }>;
  rates: Array<{
    metric: MetricKey;
    operation: string;
    quality: string;
    model: string;
    creditsPerUnit: number;
  }>;
  products: {
    creditGrant: string;
    proSubscription: string;
    enterpriseSeat: string;
  };
  packages: Array<
    | {
        key: 'free';
        name: string;
        includedCredits: number;
      }
    | {
        key: 'quickstart';
        name: string;
        includedCredits: number;
        prepaidInvoiceCents: number;
        durationMonths: number;
      }
    | {
        key: 'pro';
        name: string;
        monthlyCredits: number;
        monthlyPriceCents: number;
        autoTopUpThresholdCredits: number;
        autoTopUpToCredits: number;
      }
  >;
  powerUser: {
    contractName: string;
    annualCommitCredits: number;
    annualCommitCents: number;
    durationMonths: number;
    seatCount: number;
    seatMonthlyCents: number;
    seatMonthlyCredits: number;
    usageMultiplier: number;
  };
  personas: Array<{
    key: string;
    name: string;
    package?: PackageKey;
    directContract?: 'power-user';
    ingestAlias: string;
    usageScale: number;
  }>;
};

type StarterState = {
  accountScope: string;
  namespace: string;
  configVersion: number;
  resourcePrefix?: string;
  pricingDimension: PricingDimension | null;
  generatedAt: string;
  pricingUnit?: { id: string; name: string };
  metrics?: Record<string, string>;
  products?: Record<string, string>;
  rateCardId?: string;
  packages?: Record<string, string>;
  customers?: Record<string, string>;
  contracts?: Record<string, string>;
  billingMode?: 'metronome-only' | 'stripe';
  stripeAccountId?: string;
  deliveryMethodId?: string;
  stripeCustomers?: Record<string, string>;
  billingConfigurations?: Record<string, string>;
  checkpoints?: string[];
};

const argv = process.argv.slice(2);
const args = new Set(argv);
const apply = args.has('--apply');
const reset = args.has('--reset');
const help = args.has('--help') || args.has('-h');
const validateOnly = args.has('--validate-config');
const confirmation = argv
  .find((arg) => arg.startsWith('--confirm='))
  ?.slice('--confirm='.length);
let pricingDimension: PricingDimension | null = null;

export interface StarterRunOptions {
  apiKey: string;
  mode?: 'plan' | 'seed' | 'reset' | 'validate';
  confirmReset?: boolean;
  pricingDimension?: PricingDimension | null;
  resourcePrefix?: string;
  quickstartName?: string;
  proName?: string;
  powerUserName?: string;
  stripeSecretKey?: string;
  deliveryMethodId?: string;
  onLog?: (line: string) => void;
  onTrace?: (entry: ApiTraceEntry) => void;
}

function printHelp() {
  emit(`Metronome Starter Kit

Usage:
  npm run starter:plan
  npm run starter:seed
  npm run starter:reset
  npm run starter:reset -- --confirm=metronome-starter

Optional custom pricing property:
  --pricing-property=service_tier
  --pricing-values=standard:1,priority:1.25
  --pricing-metrics=image,video,3d
  --validate-config

Modes:
  plan    Default. Reads the target account and prints a dry-run plan.
  seed    --apply creates/reuses the namespaced catalog, personas, contracts, and usage.
  reset   --reset previews a namespace-scoped reset. --confirm=<namespace> applies it.

Credentials are read only from .env.metronome-target.local by the npm scripts.
Pricing property values must be supplied by the event producer.`);
}

async function listAll<T>(page: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of page) values.push(value);
  return values;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function starterStatePath(apiKey: string): string {
  return resolve(
    ROOT,
    `.metronome/starter/${fingerprint(apiKey)}/state.json`,
  );
}

async function readStarterState(
  apiKey: string,
): Promise<StarterState | null> {
  try {
    return JSON.parse(
      await readFile(starterStatePath(apiKey), 'utf8'),
    ) as StarterState;
  } catch {
    return null;
  }
}

async function writeStarterState(
  apiKey: string,
  state: StarterState & Record<string, unknown>,
): Promise<void> {
  const path = starterStatePath(apiKey);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`);
}

function packageUniquenessKey(config: StarterConfig, key: string): string {
  return `${config.namespace}:${key}:v${config.version}`;
}

function storedPackageKey(config: StarterConfig, key: string): string {
  return `package:${packageUniquenessKey(config, key)}`;
}

function packageCreationKey(
  config: StarterConfig,
  key: string,
  runId: string,
): string {
  return `${packageUniquenessKey(config, key)}:run-${runId}`;
}

function packageKeyMatches(
  config: StarterConfig,
  key: string,
  value: string | null | undefined,
): boolean {
  const normalized = (value ?? '').replace(/^package:/, '');
  const base = packageUniquenessKey(config, key);
  return normalized === base || normalized.startsWith(`${base}:run-`);
}

function contractKey(config: StarterConfig, personaKey: string): string {
  return `contract:${config.namespace}:${personaKey}:v${config.version}`;
}

function contractCreationKey(
  config: StarterConfig,
  personaKey: string,
  runId: string,
): string {
  return `${contractKey(config, personaKey)}:run-${runId}`;
}

function contractKeyMatches(
  config: StarterConfig,
  personaKey: string,
  value: string | null | undefined,
): boolean {
  const base = contractKey(config, personaKey);
  return value === base || value?.startsWith(`${base}:run-`) === true;
}

function packageAlias(
  config: StarterConfig,
  key: string,
  runId: string,
): string {
  return `${config.namespace}-${key}-v${config.version}-${runId}`;
}

function assertSame(label: string, actual: unknown, expected: unknown) {
  if (stable(actual) !== stable(expected)) {
    throw new Error(
      `${label} already exists with an incompatible definition.\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}\nPreview and run Starter Reset with the same resource prefix before reseeding with a different pricing property.`,
    );
  }
}

const RESERVED_PROPERTY_KEYS = new Set([
  'quantity',
  'modality',
  'operation',
  'quality',
  'model',
  'workspace_id',
  'project_id',
  'user_id',
  'customer_id',
]);

function option(name: string): string | undefined {
  return argv
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.slice(name.length + 3)
    .trim();
}

function validatePricingDimension(value: unknown): PricingDimension | null {
  if (value == null) return null;
  if (!value || typeof value !== 'object') {
    throw new Error('Pricing dimension must be an object.');
  }
  const candidate = value as {
    propertyKey?: unknown;
    values?: unknown;
    metrics?: unknown;
  };
  const propertyKey =
    typeof candidate.propertyKey === 'string'
      ? candidate.propertyKey.trim()
      : '';
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(propertyKey)) {
    throw new Error(
      'Pricing property must start with a lowercase letter and contain only lowercase letters, numbers, and underscores.',
    );
  }
  if (RESERVED_PROPERTY_KEYS.has(propertyKey)) {
    throw new Error(`Pricing property "${propertyKey}" is reserved.`);
  }
  if (
    !Array.isArray(candidate.values) ||
    candidate.values.length < 2 ||
    candidate.values.length > 4
  ) {
    throw new Error('Pricing property requires 2–4 values.');
  }
  const values = candidate.values.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Pricing value ${index + 1} is invalid.`);
    }
    const row = entry as { value?: unknown; multiplier?: unknown };
    const item = typeof row.value === 'string' ? row.value.trim() : '';
    const multiplier = Number(row.multiplier);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(item)) {
      throw new Error(
        `Pricing value ${index + 1} must contain only letters, numbers, underscores, or hyphens.`,
      );
    }
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      throw new Error(`Multiplier for "${item}" must be greater than zero.`);
    }
    return { value: item, multiplier };
  });
  if (new Set(values.map((entry) => entry.value)).size !== values.length) {
    throw new Error('Pricing property values must be unique.');
  }
  if (!Array.isArray(candidate.metrics)) {
    throw new Error('Pricing property must select Image, Video, 3D, or a combination.');
  }
  const metrics = [...new Set(candidate.metrics)].filter(
    (metric): metric is MetricKey =>
      metric === 'image' || metric === 'video' || metric === '3d',
  );
  if (metrics.length === 0 || metrics.length !== candidate.metrics.length) {
    throw new Error('Pricing metrics must contain Image, Video, 3D, or a combination.');
  }
  return { propertyKey, values, metrics };
}

function resolvePricingDimension(): PricingDimension | null {
  const fromEnvironment =
    process.env.METRONOME_STARTER_PRICING_DIMENSION?.trim();
  if (fromEnvironment) {
    try {
      return validatePricingDimension(JSON.parse(fromEnvironment));
    } catch (error) {
      throw new Error(
        `Invalid METRONOME_STARTER_PRICING_DIMENSION: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  const propertyKey = option('pricing-property');
  const rawValues = option('pricing-values');
  const rawMetrics = option('pricing-metrics');
  if (!propertyKey && !rawValues && !rawMetrics) return null;
  if (!propertyKey || !rawValues || !rawMetrics) {
    throw new Error(
      'Custom pricing requires --pricing-property, --pricing-values, and --pricing-metrics together.',
    );
  }
  return validatePricingDimension({
    propertyKey,
    values: rawValues.split(',').map((entry) => {
      const separator = entry.lastIndexOf(':');
      return {
        value: separator > 0 ? entry.slice(0, separator) : '',
        multiplier: separator > 0 ? entry.slice(separator + 1) : Number.NaN,
      };
    }),
    metrics: rawMetrics.split(',').map((entry) => entry.trim()),
  });
}

function appliesPricingDimension(metric: MetricKey): boolean {
  return pricingDimension?.metrics.includes(metric) ?? false;
}

function pricingGroupKeyFor(metric: MetricKey): string[] {
  return [
    'operation',
    'quality',
    'model',
    ...(appliesPricingDimension(metric) && pricingDimension
      ? [pricingDimension.propertyKey]
      : []),
  ];
}

function presentationGroupKeyForProduct(): string[] {
  return ['project_id', 'user_id'];
}

function metricGroupKeysFor(metric: MetricKey): string[][] {
  const pricing = pricingGroupKeyFor(metric);
  const presentation = presentationGroupKeyForProduct();
  return [
    [...pricing, 'workspace_id', ...presentation],
  ];
}

function pricingDimensionPreview(config: StarterConfig) {
  return {
    pricingDimension,
    pricingConversion: {
      fiatCurrency: config.fiatCurrency,
      fiatMinorUnitsPerCustomCredit:
        config.pricingUnit.fiatMinorUnitsPerCustomCredit,
      fiatAmountPerCustomCredit:
        config.pricingUnit.fiatMinorUnitsPerCustomCredit / 100,
    },
    usageProducts: Object.fromEntries(
      config.metrics.map((metric) => [
        metric.key,
        {
          pricingGroupKey: pricingGroupKeyFor(metric.key),
          presentationGroupKey: presentationGroupKeyForProduct(),
          metricGroupKeys: metricGroupKeysFor(metric.key),
          propertyValues:
            appliesPricingDimension(metric.key) && pricingDimension
              ? pricingDimension.values.map((entry) => entry.value)
              : [],
        },
      ]),
    ),
    rateVariants: Object.fromEntries(
      config.rates.map((rate) => [
        `${rate.metric}:${rate.operation}:${rate.quality}:${rate.model}`,
        appliesPricingDimension(rate.metric) && pricingDimension
          ? pricingDimension.values.map((entry) => ({
              value: entry.value,
              creditsPerUnit: rate.creditsPerUnit * entry.multiplier,
            }))
          : [{ value: null, creditsPerUnit: rate.creditsPerUnit }],
      ]),
    ),
  };
}

function applyStarterOverrides(
  config: StarterConfig,
  overrides: Pick<
    StarterRunOptions,
    'resourcePrefix' | 'quickstartName' | 'proName' | 'powerUserName'
  > = {},
): StarterConfig {
  const prefix =
    overrides.resourcePrefix?.trim() ||
    config.resourcePrefix;
  const personaNames: Record<string, string | undefined> = {
    'enterprise-quickstart':
      overrides.quickstartName?.trim(),
    pro: overrides.proName?.trim(),
    'b2b-power-user':
      overrides.powerUserName?.trim(),
  };
  const metricNames: Record<MetricKey, string> = {
    image: `${prefix} - Image Generations`,
    video: `${prefix} - Video Seconds`,
    '3d': `${prefix} - 3D Generations`,
  };
  return {
    ...config,
    resourcePrefix: prefix,
    rateCard: {
      ...config.rateCard,
      name: `${prefix} - Standard Rate Card`,
    },
    metrics: config.metrics.map((metric) => ({
      ...metric,
      name: metricNames[metric.key],
    })),
    products: {
      creditGrant: `${prefix} - Credit Grant`,
      proSubscription: `${prefix} - Pro Subscription`,
      enterpriseSeat: `${prefix} - Enterprise Seat`,
    },
    packages: config.packages.map((pkg) => ({
      ...pkg,
      name:
        pkg.key === 'free'
          ? `${prefix} Free`
          : pkg.key === 'quickstart'
            ? `${prefix} Enterprise Quickstart`
            : `${prefix} Pro`,
    })) as StarterConfig['packages'],
    powerUser: {
      ...config.powerUser,
      contractName: `${prefix} B2B Power User`,
    },
    personas: config.personas.map((persona) => ({
      ...persona,
      name: personaNames[persona.key] || persona.name,
      ingestAlias: `${persona.ingestAlias}:v${config.version}`,
    })),
  };
}

async function createPricingUnit(apiKey: string, name: string) {
  const response = await metronomeFetch('https://api.metronome.com/v1/credit-types/create', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(
      `Create pricing unit failed (${response.status}): ${JSON.stringify(body)}`,
    );
  }
  const id = body?.data?.id ?? body?.data;
  if (!id) throw new Error('Metronome returned no pricing unit ID');
  return String(id);
}

async function resolveFiatCreditTypeId(
  client: Metronome,
  currency: string,
): Promise<string> {
  const normalizedCurrency = currency.trim().toUpperCase();
  const available: string[] = [];
  for await (const unit of client.v1.pricingUnits.list()) {
    if (!unit.is_currency) continue;
    available.push(unit.name ?? unit.id ?? 'unknown');
    const explicitCode = String(
      (unit as typeof unit & { currency_code?: string }).currency_code ?? '',
    ).toUpperCase();
    const nameTokens = String(unit.name ?? '')
      .toUpperCase()
      .split(/[^A-Z]+/)
      .filter(Boolean);
    if (
      unit.id &&
      (explicitCode === normalizedCurrency ||
        nameTokens.includes(normalizedCurrency))
    ) {
      return unit.id;
    }
  }
  throw new Error(
    `No ${normalizedCurrency} fiat pricing unit was found on this account. Available currency units: ${available.join(', ') || 'none'}.`,
  );
}

async function discover(client: Metronome, config: StarterConfig) {
  const [pricingUnits, metrics, products, rateCards, packages, customers] =
    await Promise.all([
      listAll(client.v1.pricingUnits.list()),
      listAll(client.v1.billableMetrics.list()),
      listAll(
        client.v1.contracts.products.list({ archive_filter: 'NOT_ARCHIVED' }),
      ),
      listAll(client.v1.contracts.rateCards.list({ body: {} })),
      listAll(client.v1.packages.list()),
      listAll(client.v1.customers.list()),
    ]);

  const metricNames = new Set(config.metrics.map((metric) => metric.name));
  const productNames = new Set([
    ...metricNames,
    ...Object.values(config.products),
  ]);
  const packageKeys = new Set(
    config.packages.map((definition) => storedPackageKey(config, definition.key)),
  );
  const personaAliases = new Set(
    config.personas.map((persona) => persona.ingestAlias),
  );
  const personaNames = new Set(
    config.personas.map((persona) => persona.name),
  );

  return {
    pricingUnit: pricingUnits.find(
      (unit) => !unit.is_currency && unit.name === config.pricingUnit.name,
    ),
    metrics: metrics.filter((metric) => metricNames.has(metric.name)),
    products: products.filter((product) =>
      productNames.has(product.current.name),
    ),
    rateCard: rateCards.find(
      (rateCard) => rateCard.name === config.rateCard.name,
    ),
    packages: packages.filter(
      (pkg) =>
        !pkg.archived_at &&
        (packageKeys.has(pkg.uniqueness_key ?? '') ||
          pkg.uniqueness_key?.startsWith(`package:${config.namespace}:`) ||
          config.packages.some((wanted) => wanted.name === pkg.name)),
    ),
    customers: customers.filter(
      (customer) =>
        !customer.archived_at &&
        (personaNames.has(customer.name) ||
          (customer.ingest_aliases ?? []).some((alias) =>
            personaAliases.has(alias) ||
            alias.startsWith(`${config.namespace}:`),
          )),
    ),
  };
}

function definitions(config: StarterConfig) {
  return {
    metrics: config.metrics.map((metric) => metric.name),
    products: [
      ...config.metrics.map((metric) => metric.name),
      ...Object.values(config.products),
    ],
    packages: config.packages.map((pkg) => pkg.name),
    customers: config.personas.map((persona) => persona.name),
  };
}

async function printPlan(client: Metronome, config: StarterConfig) {
  const found = await discover(client, config);
  const wanted = definitions(config);
  const ownedPackages = found.packages.filter((pkg) =>
    config.packages.some((definition) =>
      packageKeyMatches(
        config,
        definition.key,
        pkg.uniqueness_key,
      ),
    ),
  );
  const contractKeys = new Set<string>();
  for (const customer of found.customers) {
    if (
      !config.personas.some((persona) =>
        customer.ingest_aliases?.includes(persona.ingestAlias),
      )
    ) {
      continue;
    }
    const contracts = await client.v2.contracts.list({
      customer_id: customer.id,
      include_archived: false,
    } as any);
    for (const contract of contracts.data ?? []) {
      contractKeys.add(String((contract as any).uniqueness_key ?? ''));
    }
  }
  const existingNames = {
    metrics: new Set(found.metrics.map((metric) => metric.name)),
    products: new Set(
      found.products.map((product) => product.current.name),
    ),
    packages: new Set(ownedPackages.map((pkg) => pkg.name)),
    customers: new Set(
      found.customers
        .filter((customer) =>
          config.personas.some((persona) =>
            customer.ingest_aliases?.includes(persona.ingestAlias),
          ),
        )
        .map((customer) => customer.name),
    ),
  };
  emit(
    JSON.stringify(
      {
        mode: 'dry-run',
        namespace: config.namespace,
        options: {
          pricingDimension,
        },
        existing: {
          pricingUnit: found.pricingUnit?.name ?? null,
          metrics: [...existingNames.metrics],
          products: [...existingNames.products],
          rateCard: found.rateCard?.name ?? null,
          packages: [...existingNames.packages],
          customers: [...existingNames.customers],
          contracts: config.personas
            .filter((persona) =>
              Array.from(contractKeys).some((key) =>
                contractKeyMatches(config, persona.key, key),
              ),
            )
            .map((persona) => persona.name),
        },
        wouldCreate: {
          pricingUnit: found.pricingUnit ? null : config.pricingUnit.name,
          metrics: wanted.metrics.filter(
            (name) => !existingNames.metrics.has(name),
          ),
          products: wanted.products.filter(
            (name) => !existingNames.products.has(name),
          ),
          rateCard: found.rateCard ? null : config.rateCard.name,
          packages: wanted.packages.filter(
            (name) => !existingNames.packages.has(name),
          ),
          customers: wanted.customers.filter(
            (name) => !existingNames.customers.has(name),
          ),
          contracts: config.personas
            .filter(
              (persona) =>
                !contractKeys.has(contractKey(config, persona.key)),
            )
            .map((persona) => persona.name),
          deterministicUsage: config.personas.map((persona) => persona.name),
        },
      },
      null,
      2,
    ),
  );
}

async function ensureCatalog(
  client: Metronome,
  apiKey: string,
  config: StarterConfig,
  stripeDeliveryMethod?: string,
) {
  const found = await discover(client, config);
  let pricingUnitId = found.pricingUnit?.id;
  if (!pricingUnitId) {
    emit(`Creating pricing unit: ${config.pricingUnit.name}`);
    pricingUnitId = await createPricingUnit(apiKey, config.pricingUnit.name);
  }
  const fiatCreditTypeId = await resolveFiatCreditTypeId(
    client,
    config.fiatCurrency,
  );

  const metricIds: Record<string, string> = {};
  for (const definition of config.metrics) {
    const groupKeys = metricGroupKeysFor(definition.key);
    const propertyFilters = [
      { name: 'quantity', exists: true },
      {
        name: 'modality',
        exists: true,
        in_values: [definition.modality],
      },
      { name: 'operation', exists: true },
      { name: 'quality', exists: true },
      { name: 'model', exists: true },
      { name: 'workspace_id', exists: true },
      { name: 'project_id', exists: true },
      { name: 'user_id', exists: true },
      ...(appliesPricingDimension(definition.key) && pricingDimension
        ? [
            {
              name: pricingDimension.propertyKey,
              exists: true,
              in_values: pricingDimension.values.map((entry) => entry.value),
            },
          ]
        : []),
    ];
    const existing = found.metrics.find(
      (metric) => metric.name === definition.name,
    );
    if (existing) {
      assertSame(`${definition.name} group_keys`, existing.group_keys ?? [], groupKeys);
      assertSame(
        `${definition.name} property_filters`,
        [...(existing.property_filters ?? [])].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
        [...propertyFilters].sort((a, b) => a.name.localeCompare(b.name)),
      );
      metricIds[definition.key] = existing.id;
      continue;
    }
    emit(`Creating billable metric: ${definition.name}`);
    const response = await client.v1.billableMetrics.create({
      name: definition.name,
      aggregation_type: 'SUM',
      aggregation_key: 'quantity',
      event_type_filter: { in_values: [config.eventType] },
      property_filters: propertyFilters,
      group_keys: groupKeys,
    });
    metricIds[definition.key] = response.data.id;
  }

  const productsByName = new Map(
    found.products.map((product) => [product.current.name, product]),
  );
  const productIds: Record<string, string> = {};
  for (const definition of config.metrics) {
    const pricingGroupKey = pricingGroupKeyFor(definition.key);
    const presentationGroupKey = presentationGroupKeyForProduct();
    const existing = productsByName.get(definition.name);
    if (existing) {
      assertSame(
        `${definition.name} pricing_group_key`,
        existing.current.pricing_group_key,
        pricingGroupKey,
      );
      assertSame(
        `${definition.name} presentation_group_key`,
        existing.current.presentation_group_key,
        presentationGroupKey,
      );
      productIds[definition.key] = existing.id;
      continue;
    }
    emit(`Creating usage product: ${definition.name}`);
    const response = await client.v1.contracts.products.create({
      name: definition.name,
      type: 'USAGE',
      billable_metric_id: metricIds[definition.key],
      pricing_group_key: pricingGroupKey,
      presentation_group_key: presentationGroupKey,
      tags: [config.namespace, 'usage'],
    });
    productIds[definition.key] = response.data.id;
  }

  for (const [key, name, type] of [
    ['creditGrant', config.products.creditGrant, 'FIXED'],
    ['proSubscription', config.products.proSubscription, 'SUBSCRIPTION'],
    ['enterpriseSeat', config.products.enterpriseSeat, 'SUBSCRIPTION'],
  ] as const) {
    const existing = productsByName.get(name);
    if (existing) {
      productIds[key] = existing.id;
      continue;
    }
    emit(`Creating ${type.toLowerCase()} product: ${name}`);
    const response = await client.v1.contracts.products.create({
      name,
      type,
      tags: [config.namespace],
    });
    productIds[key] = response.data.id;
  }

  let rateCardId = found.rateCard?.id;
  if (!rateCardId) {
    emit(`Creating rate card: ${config.rateCard.name}`);
    const response = await client.v1.contracts.rateCards.create({
      name: config.rateCard.name,
      description:
        'Generic Metronome-only Generation pricing created by the Starter Kit.',
      aliases: [{ name: config.rateCard.alias }],
      fiat_credit_type_id: fiatCreditTypeId,
      credit_type_conversions: [
        {
          custom_credit_type_id: pricingUnitId,
          fiat_per_custom_credit:
            config.pricingUnit.fiatMinorUnitsPerCustomCredit,
        },
      ],
    });
    rateCardId = response.data.id;
  }

  const currentRates = await listAll(
    client.v1.contracts.rateCards.rates.list({
      rate_card_id: rateCardId,
      at: new Date().toISOString(),
    }),
  );
  const ratesToAdd: any[] = [];
  for (const definition of config.rates) {
    const dimensionValues =
      appliesPricingDimension(definition.metric) && pricingDimension
        ? pricingDimension.values
        : [{ value: null, multiplier: 1 }];
    for (const dimensionValue of dimensionValues) {
      const values: Record<string, string> = {
        operation: definition.operation,
        quality: definition.quality,
        model: definition.model,
        ...(dimensionValue.value && pricingDimension
          ? { [pricingDimension.propertyKey]: dimensionValue.value }
          : {}),
      };
      const price = definition.creditsPerUnit * dimensionValue.multiplier;
      const existing = currentRates.find(
        (rate) =>
          rate.product_id === productIds[definition.metric] &&
          stable(rate.pricing_group_values ?? {}) === stable(values),
      );
      if (existing) {
        assertSame(
          `${definition.metric} ${dimensionValue.value ?? 'base'} rate`,
          Number(existing.rate?.price),
          price,
        );
      } else {
        ratesToAdd.push({
          product_id: productIds[definition.metric],
          rate_type: 'FLAT',
          price,
          credit_type_id: pricingUnitId,
          pricing_group_values: values,
          starting_at: '2020-01-01T00:00:00.000Z',
          entitled: true,
        });
      }
    }
  }

  const powerUser = config.powerUser;
  const pro = config.packages.find(
    (pkg): pkg is Extract<(typeof config.packages)[number], { key: 'pro' }> =>
      pkg.key === 'pro',
  )!;
  const proRate = currentRates.find(
    (rate) =>
      rate.product_id === productIds.proSubscription &&
      rate.billing_frequency === 'MONTHLY',
  );
  if (proRate) {
    assertSame(
      'Pro monthly subscription rate',
      Number(proRate.rate?.price),
      pro.monthlyPriceCents,
    );
  } else {
    ratesToAdd.push({
      product_id: productIds.proSubscription,
      rate_type: 'FLAT',
      price: pro.monthlyPriceCents,
      credit_type_id: fiatCreditTypeId,
      billing_frequency: 'MONTHLY',
      starting_at: '2020-01-01T00:00:00.000Z',
      entitled: true,
    });
  }
  const seatRate = currentRates.find(
    (rate) =>
      rate.product_id === productIds.enterpriseSeat &&
      rate.billing_frequency === 'MONTHLY',
  );
  if (seatRate) {
    assertSame(
      'Enterprise seat monthly rate',
      Number(seatRate.rate?.price),
      powerUser.seatMonthlyCents,
    );
  } else {
    ratesToAdd.push({
      product_id: productIds.enterpriseSeat,
      rate_type: 'FLAT',
      price: powerUser.seatMonthlyCents,
      credit_type_id: fiatCreditTypeId,
      billing_frequency: 'MONTHLY',
      starting_at: '2020-01-01T00:00:00.000Z',
      entitled: true,
    });
  }
  if (ratesToAdd.length > 0) {
    emit(`Adding ${ratesToAdd.length} rates`);
    await client.v1.contracts.rateCards.rates.addMany({
      rate_card_id: rateCardId,
      rates: ratesToAdd,
    });
  }

  const packageIds: Record<string, string> = {};
  const packageRunId = Date.now().toString(36);
  const archivedPackageIds = new Set<string>();
  const usageProductIds = config.metrics.map(
    (metric) => productIds[metric.key],
  );
  for (const definition of config.packages) {
    let existing = found.packages.find(
      (pkg) =>
        pkg.name === definition.name &&
        packageKeyMatches(config, definition.key, pkg.uniqueness_key),
    );
    if (existing && stripeDeliveryMethod) {
      const packageDetail = await client.v1.packages.retrieve({
        package_id: existing.id,
      });
      if ((packageDetail.data as any).billing_provider !== 'stripe') {
        emit(
          `Replacing partial non-Stripe package before Stripe seed: ${definition.name}`,
        );
        await client.v1.packages.archive({ package_id: existing.id });
        archivedPackageIds.add(existing.id);
        existing = undefined;
      }
    }
    if (existing) {
      packageIds[definition.key] = existing.id;
      continue;
    }
    const uniquenessKey = packageCreationKey(
      config,
      definition.key,
      packageRunId,
    );
    const common = {
      name: definition.name,
      contract_name: definition.name,
      rate_card_id: rateCardId,
      ...(stripeDeliveryMethod
        ? {
            billing_provider: 'stripe' as const,
            delivery_method: stripeDeliveryMethod as any,
          }
        : {}),
      aliases: [
        { name: packageAlias(config, definition.key, packageRunId) },
      ],
      uniqueness_key: uniquenessKey,
      billing_anchor_date: 'contract_start_date' as const,
      usage_statement_schedule: {
        frequency: 'MONTHLY' as const,
        day: 'CONTRACT_START' as const,
      },
    };
    const sameName = found.packages.find(
      (pkg) =>
        pkg.name === definition.name && !archivedPackageIds.has(pkg.id),
    );
    if (
      sameName &&
      !packageKeyMatches(config, definition.key, sameName.uniqueness_key)
    ) {
      throw new Error(
        `Package name "${definition.name}" is already in use with a different uniqueness key; refusing to replace it.`,
      );
    }
    let body: any;
    if (definition.key === 'free') {
      body = {
        ...common,
        credits: [
          {
            product_id: productIds.creditGrant,
            name: 'Free generation credits',
            priority: 1,
            rate_type: 'LIST_RATE',
            applicable_product_ids: usageProductIds,
            access_schedule: {
              credit_type_id: pricingUnitId,
              schedule_items: [
                {
                  amount: definition.includedCredits,
                  starting_at_offset: { value: 0, unit: 'DAYS' },
                  duration: { value: 10, unit: 'YEARS' },
                },
              ],
            },
          },
        ],
      };
    } else if (definition.key === 'quickstart') {
      body = {
        ...common,
        duration: { value: definition.durationMonths, unit: 'MONTHS' },
        commits: [
          {
            type: 'PREPAID',
            product_id: productIds.creditGrant,
            name: 'Enterprise Quickstart commitment',
            priority: 1,
            rate_type: 'LIST_RATE',
            applicable_product_ids: usageProductIds,
            access_schedule: {
              credit_type_id: pricingUnitId,
              schedule_items: [
                {
                  amount: definition.includedCredits,
                  starting_at_offset: { value: 0, unit: 'DAYS' },
                  duration: {
                    value: definition.durationMonths,
                    unit: 'MONTHS',
                  },
                },
              ],
            },
            invoice_schedule: {
              credit_type_id: fiatCreditTypeId,
              schedule_items: [
                {
                  unit_price: definition.prepaidInvoiceCents,
                  quantity: 1,
                  date_offset: { value: 0, unit: 'DAYS' },
                },
              ],
            },
          },
        ],
      };
    } else if (definition.key === 'pro') {
      body = {
        ...common,
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
            product_id: productIds.creditGrant,
            name: 'Pro monthly credits',
            priority: 1,
            rate_type: 'LIST_RATE',
            applicable_product_ids: usageProductIds,
            recurrence_frequency: 'MONTHLY',
            starting_at_offset: { value: 0, unit: 'DAYS' },
            commit_duration: { value: 1, unit: 'PERIODS' },
            proration: 'NONE',
            access_amount: {
              credit_type_id: pricingUnitId,
              unit_price: definition.monthlyCredits,
              quantity: 1,
            },
          },
        ],
      };
    }
    emit(`Creating package: ${definition.name}`);
    const response = await client.v1.packages.create(body);
    packageIds[definition.key] = response.data.id;
  }

  return {
    pricingUnitId,
    fiatCreditTypeId,
    metricIds,
    productIds,
    rateCardId,
    packageIds,
  };
}

function hourBoundary(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 28);
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString();
}

type StripeSeedContext = {
  stripe: Stripe;
  stripeAccountId: string;
  deliveryMethodId?: string;
  deliveryMethod: string;
  customerIds: Record<string, string>;
};

async function preflightStripe(
  client: Metronome,
  secretKey: string,
  requestedDeliveryMethodId?: string,
  onTrace?: (entry: ApiTraceEntry) => void,
): Promise<Omit<StripeSeedContext, 'customerIds'>> {
  if (!secretKey.startsWith('sk_test_')) {
    throw new Error('Stripe-assisted seed requires an sk_test_ key.');
  }
  const stripe = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
  if (onTrace) {
    stripe.on('response', (event) => {
      onTrace({
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
        response: {
          requestId: event.request_id,
          apiVersion: event.api_version,
        },
      });
    });
  }
  const account = await stripe.accounts.retrieve();
  const providers = await client.v1.settings.billingProviders.list({});
  const stripeProviders = (providers.data ?? []).filter(
    (provider: any) => provider.billing_provider === 'stripe',
  );
  if (stripeProviders.length === 0) {
    throw new Error(
      'No Stripe billing provider is connected to this Metronome account.',
    );
  }
  if (stripeProviders.length > 1 && !requestedDeliveryMethodId) {
    const choices = stripeProviders
      .map((candidate: any) => {
        const accountId =
          candidate.delivery_method_configuration?.stripe_account_id ??
          candidate.configuration?.stripe_account_id ??
          'unknown account';
        return `${candidate.delivery_method_id ?? 'missing id'} (${accountId})`;
      })
      .join(', ');
    throw new Error(
      `Several Stripe delivery methods are connected. Select one before seeding. Available: ${choices}`,
    );
  }
  const provider = requestedDeliveryMethodId
    ? stripeProviders.find(
        (candidate: any) =>
          candidate.delivery_method_id === requestedDeliveryMethodId,
      )
    : stripeProviders[0];
  if (!provider) {
    throw new Error('The selected Stripe delivery method was not found.');
  }
  const providerDetails = provider as any;
  const configuredAccountId =
    providerDetails.delivery_method_configuration?.stripe_account_id ??
    providerDetails.configuration?.stripe_account_id;
  if (!configuredAccountId) {
    throw new Error(
      'Metronome did not expose the Stripe account ID for this delivery method, so the account pairing could not be verified.',
    );
  }
  if (configuredAccountId !== account.id) {
    throw new Error(
      `Stripe account ${account.id} does not match Metronome delivery method account ${configuredAccountId}.`,
    );
  }
  emit(`Stripe preflight passed for account ${account.id}.`);
  return {
    stripe,
    stripeAccountId: account.id,
    deliveryMethodId: provider.delivery_method_id,
    deliveryMethod:
      provider.delivery_method ?? 'direct_to_billing_provider',
  };
}

async function createStripePersonaCustomer(
  stripe: Stripe,
  persona: StarterConfig['personas'][number],
  namespace: string,
): Promise<string> {
  const customer = await stripe.customers.create({
    name: persona.name,
    email: `${persona.key}@example.com`,
    address: {
      line1: '354 Oyster Point Blvd',
      city: 'South San Francisco',
      state: 'CA',
      postal_code: '94080',
      country: 'US',
    },
    metadata: {
      starter_namespace: namespace,
      starter_persona: persona.key,
    },
  });
  const paymentMethod = await stripe.paymentMethods.create({
    type: 'card',
    card: { token: 'tok_visa' },
  });
  await stripe.paymentMethods.attach(paymentMethod.id, {
    customer: customer.id,
  });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: paymentMethod.id },
  });
  return customer.id;
}

function taxProviderDisabled(error: unknown): boolean {
  return /tax_provider is not enabled/i.test(
    String((error as { message?: string })?.message ?? error),
  );
}

async function ensureStripeBillingConfiguration(
  client: Metronome,
  customerId: string,
  stripeCustomerId: string,
  stripeSeed: StripeSeedContext,
): Promise<string | undefined> {
  const existing = await client.v1.customers.retrieveBillingConfigurations({
    customer_id: customerId,
  });
  const match = (existing.data ?? []).find(
    (configuration: any) =>
      !configuration.archived_at &&
      configuration.billing_provider === 'stripe' &&
      configuration.configuration?.stripe_customer_id === stripeCustomerId,
  );
  if (match) return match.id;

  const configuration = (withTax: boolean) => ({
    customer_id: customerId,
    billing_provider: 'stripe' as const,
    delivery_method: stripeSeed.deliveryMethod as any,
    ...(stripeSeed.deliveryMethodId
      ? { delivery_method_id: stripeSeed.deliveryMethodId }
      : {}),
    ...(withTax ? { tax_provider: 'stripe' as const } : {}),
    configuration: {
      stripe_customer_id: stripeCustomerId,
      stripe_collection_method: 'charge_automatically' as const,
    },
  });
  try {
    await client.v1.customers.setBillingConfigurations({
      data: [configuration(true)],
    });
  } catch (error) {
    if (!taxProviderDisabled(error)) throw error;
    emit('Stripe tax is unavailable; linked customer without tax_provider.');
    await client.v1.customers.setBillingConfigurations({
      data: [configuration(false)],
    });
  }
  const refreshed = await client.v1.customers.retrieveBillingConfigurations({
    customer_id: customerId,
  });
  return (refreshed.data ?? []).find(
    (row: any) =>
      !row.archived_at &&
      row.billing_provider === 'stripe' &&
      row.configuration?.stripe_customer_id === stripeCustomerId,
  )?.id;
}

async function ensureSeededProAutoTopUp(
  client: Metronome,
  config: StarterConfig,
  catalog: Awaited<ReturnType<typeof ensureCatalog>>,
  customerId: string,
  contractId: string,
  alreadyConfigured: boolean,
  stripeSeed?: StripeSeedContext,
): Promise<void> {
  if (alreadyConfigured) return;
  const proPackage = config.packages.find((pkg) => pkg.key === 'pro');
  if (!proPackage || proPackage.key !== 'pro') {
    throw new Error('Canonical Pro package configuration is missing.');
  }
  await (client.v2.contracts as any).edit({
    customer_id: customerId,
    contract_id: contractId,
    add_prepaid_balance_threshold_configuration: {
      is_enabled: true,
      threshold_amount: proPackage.autoTopUpThresholdCredits,
      recharge_to_amount: proPackage.autoTopUpToCredits,
      custom_credit_type_id: catalog.pricingUnitId,
      payment_gate_config: {
        payment_gate_type: stripeSeed ? 'STRIPE' : 'NONE',
        ...(stripeSeed
          ? {
              stripe_config: {
                payment_type: 'INVOICE',
              },
            }
          : {}),
      },
      commit: {
        product_id: catalog.productIds.creditGrant,
        name: 'Seeded Pro Auto Top-Up',
        applicable_product_ids: config.metrics.map(
          (metric) => catalog.productIds[metric.key],
        ),
      },
    },
  });
  emit('Configured auto top-up for the seeded Pro persona.');
}

async function ensurePersonas(
  client: Metronome,
  config: StarterConfig,
  catalog: Awaited<ReturnType<typeof ensureCatalog>>,
  stripeSeed?: StripeSeedContext,
) {
  const found = await discover(client, config);
  const customerIds: Record<string, string> = {};
  const contractIds: Record<string, string> = {};
  const billingConfigurationIds: Record<string, string> = {};
  const startingAt = hourBoundary();
  const contractRunId = Date.now().toString(36);

  for (const persona of config.personas) {
    const existingCustomer = found.customers.find((candidate) =>
      candidate.ingest_aliases?.includes(persona.ingestAlias),
    );
    const nameConflict = found.customers.find(
      (candidate) =>
        candidate.name === persona.name &&
        !candidate.ingest_aliases?.includes(persona.ingestAlias),
    );
    if (!existingCustomer && nameConflict) {
      throw new Error(
        `Customer name "${persona.name}" already exists without the starter ingest alias; refusing to adopt it.`,
      );
    }
    let customerId = existingCustomer?.id;
    if (!customerId) {
      emit(`Creating customer: ${persona.name}`);
      customerId = stripeSeed
        ? await createMetronomeCustomer(client, {
            name: persona.name,
            ingestAliases: [persona.ingestAlias],
            stripeCustomerId: stripeSeed.customerIds[persona.key],
            deliveryMethodId: stripeSeed.deliveryMethodId,
          })
        : (
            await client.v1.customers.create({
              name: persona.name,
              ingest_aliases: [persona.ingestAlias],
            })
          ).data.id;
    }
    customerIds[persona.key] = customerId;
    if (stripeSeed) {
      const billingConfigurationId =
        await ensureStripeBillingConfiguration(
          client,
          customerId,
          stripeSeed.customerIds[persona.key],
          stripeSeed,
        );
      if (billingConfigurationId) {
        billingConfigurationIds[persona.key] = billingConfigurationId;
      }
    }

    const contracts = await client.v2.contracts.list({
      customer_id: customerId,
      include_archived: false,
    } as any);
    const expectedContractName =
      persona.directContract === 'power-user'
        ? config.powerUser.contractName
        : config.packages.find((pkg) => pkg.key === persona.package)?.name;
    const matchingContracts = (contracts.data ?? []).filter(
      (contract: any) =>
        contractKeyMatches(config, persona.key, contract.uniqueness_key) ||
        (contract.name === expectedContractName &&
          contract.rate_card_id === catalog.rateCardId),
    );
    if (matchingContracts.length > 1) {
      throw new Error(
        `Customer "${persona.name}" has ${matchingContracts.length} active starter contracts. Run Starter Reset once to remove the duplicate contracts before reseeding.`,
      );
    }
    if (matchingContracts.length === 1) {
      contractIds[persona.key] = matchingContracts[0].id;
      if (stripeSeed) {
        await attachStripeBillingProviderToContract(
          client,
          customerId,
          matchingContracts[0].id,
          stripeSeed.deliveryMethodId,
        );
      }
      if (persona.key === 'pro') {
        await ensureSeededProAutoTopUp(
          client,
          config,
          catalog,
          customerId,
          matchingContracts[0].id,
          Boolean(
            (matchingContracts[0] as any)
              .prepaid_balance_threshold_configuration?.is_enabled,
          ),
          stripeSeed,
        );
      }
      continue;
    }
    emit(`Creating contract: ${persona.name}`);
    const uniquenessKey = contractCreationKey(
      config,
      persona.key,
      contractRunId,
    );
    let response;
    if (persona.directContract !== 'power-user') {
      if (!persona.package) {
        throw new Error(`Persona "${persona.key}" has no package configured.`);
      }
      response = await client.v1.contracts.create({
        customer_id: customerId,
        package_id: catalog.packageIds[persona.package],
        starting_at: startingAt,
        uniqueness_key: uniquenessKey,
      });
    } else {
      const powerUser = config.powerUser;
      const endingBeforeDate = new Date(startingAt);
      endingBeforeDate.setUTCMonth(
        endingBeforeDate.getUTCMonth() + powerUser.durationMonths,
      );
      const endingBefore = endingBeforeDate.toISOString();
      const usageProductIds = config.metrics.map(
        (metric) => catalog.productIds[metric.key],
      );
      const seatIds = Array.from(
        { length: powerUser.seatCount },
        (_, index) => `power-user-seat-${index + 1}`,
      );
      response = await client.v1.contracts.create({
        customer_id: customerId,
        starting_at: startingAt,
        ending_before: endingBefore,
        rate_card_id: catalog.rateCardId,
        name: powerUser.contractName,
        uniqueness_key: uniquenessKey,
        ...(stripeSeed
          ? {
              billing_provider_configuration: {
                billing_provider: 'stripe',
                delivery_method: stripeSeed.deliveryMethod,
                ...(stripeSeed.deliveryMethodId
                  ? {
                      delivery_method_id:
                        stripeSeed.deliveryMethodId,
                    }
                  : {}),
              },
            }
          : {}),
        commits: [
          {
            type: 'PREPAID',
            product_id: catalog.productIds.creditGrant,
            name: 'B2B annual commitment',
            rate_type: 'LIST_RATE',
            applicable_product_ids: usageProductIds,
            access_schedule: {
              credit_type_id: catalog.pricingUnitId,
              schedule_items: [
                {
                  amount: powerUser.annualCommitCredits,
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
                  unit_price: powerUser.annualCommitCents,
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
            multiplier: powerUser.usageMultiplier,
          },
          {
            starting_at: startingAt,
            override_specifiers: [
              {
                product_id: catalog.productIds.enterpriseSeat,
                billing_frequency: 'MONTHLY',
              },
            ],
            type: 'OVERWRITE',
            overwrite_rate: {
              rate_type: 'FLAT',
              credit_type_id: catalog.fiatCreditTypeId,
              price: powerUser.seatMonthlyCents,
            },
          },
        ],
        subscriptions: [
          {
            name: 'B2B power user seats',
            collection_schedule: 'advance',
            starting_at: startingAt,
            ending_before: endingBefore,
            proration: {
              is_prorated: false,
              invoice_behavior: 'bill_on_next_collection_date',
            },
            subscription_rate: {
              billing_frequency: 'monthly',
              product_id: catalog.productIds.enterpriseSeat,
            },
            quantity_management_mode: 'SEAT_BASED',
            seat_config: {
              initial_seat_ids: seatIds,
              seat_group_key: 'user_id',
            },
            temporary_id: 'power_user_seats',
          },
        ],
        recurring_credits: [
          {
            product_id: catalog.productIds.creditGrant,
            name: 'Monthly credits per seat',
            priority: 50,
            rate_type: 'LIST_RATE',
            applicable_product_ids: usageProductIds,
            starting_at: startingAt,
            ending_before: endingBefore,
            recurrence_frequency: 'MONTHLY',
            commit_duration: { value: 1, unit: 'PERIODS' },
            proration: 'NONE',
            rollover_fraction: 0,
            access_amount: {
              credit_type_id: catalog.pricingUnitId,
              unit_price: powerUser.seatMonthlyCredits,
            },
            subscription_config: {
              subscription_id: 'power_user_seats',
              allocation: 'INDIVIDUAL',
              apply_seat_increase_config: { is_prorated: false },
            },
          },
        ],
      } as any);
    }
    contractIds[persona.key] = response.data.id;
    if (stripeSeed) {
      await attachStripeBillingProviderToContract(
        client,
        customerId,
        response.data.id,
        stripeSeed.deliveryMethodId,
      );
    }
    if (persona.key === 'pro') {
      await ensureSeededProAutoTopUp(
        client,
        config,
        catalog,
        customerId,
        response.data.id,
        false,
        stripeSeed,
      );
    }
  }
  return { customerIds, contractIds, billingConfigurationIds };
}

function stableIndex(seed: string, length: number): number {
  return Number.parseInt(fingerprint(seed).slice(0, 8), 16) % length;
}

async function seedUsage(
  client: Metronome,
  config: StarterConfig,
  customerIds: Record<string, string>,
) {
  const now = new Date();
  const events: any[] = [];
  for (const persona of config.personas) {
    const isPowerUser = persona.key === 'b2b-power-user';
    const userCount = isPowerUser ? config.powerUser.seatCount : 2;
    const powerUserSeatPool = [8, 6, 4, 2, 1].flatMap((weight, index) =>
      Array.from({ length: weight }, () => index),
    );
    const powerUserTargets = [1.5, 0.7, 0.45, 0.25, 0.1].map(
      (fraction) => config.powerUser.seatMonthlyCredits * fraction,
    );
    const powerUserSpend = Array.from({ length: userCount }, () => 0);
    for (let day = 1; day <= 21; day += 1) {
      for (let slot = 0; slot < persona.usageScale; slot += 1) {
        const timestamp = new Date(now);
        timestamp.setUTCDate(timestamp.getUTCDate() - day);
        const dateKey = timestamp.toISOString().slice(0, 10);
        timestamp.setUTCHours(
          8 +
            stableIndex(
              `${config.namespace}:${persona.key}:${dateKey}:${slot}:hour`,
              14,
            ),
          (slot * 17) % 60,
          0,
          0,
        );
        const rate =
          config.rates[
            stableIndex(
              `${config.namespace}:${persona.key}:${dateKey}:${slot}:rate`,
              config.rates.length,
            )
          ];
        const customerId = customerIds[persona.key];
        const seed = `${config.namespace}:${customerId}:${persona.key}:${dateKey}:${slot}:${rate.metric}:${rate.operation}:${rate.quality}:${rate.model}`;
        const userIndex = isPowerUser
          ? powerUserSeatPool[
              stableIndex(`${seed}:seat`, powerUserSeatPool.length)
            ]
          : slot % userCount;
        const quantity =
          rate.metric === 'video'
            ? 5 + stableIndex(`${seed}:quantity`, 20)
            : 1;
        const selectedPricingValue =
          pricingDimension?.metrics.includes(rate.metric)
            ? pricingDimension.values[
                stableIndex(
                  `${seed}:${pricingDimension.propertyKey}`,
                  pricingDimension.values.length,
                )
              ]
            : null;
        if (isPowerUser) {
          const estimatedCredits =
            quantity *
            rate.creditsPerUnit *
            (selectedPricingValue?.multiplier ?? 1) *
            config.powerUser.usageMultiplier;
          if (
            powerUserSpend[userIndex] + estimatedCredits >
            powerUserTargets[userIndex]
          ) {
            continue;
          }
          powerUserSpend[userIndex] += estimatedCredits;
        }
        events.push({
          transaction_id: `${config.namespace}-${fingerprint(seed)}`,
          customer_id: customerId,
          event_type: config.eventType,
          timestamp: timestamp.toISOString(),
          properties: {
            quantity,
            modality: rate.metric,
            operation: rate.operation,
            quality: rate.quality,
            model: rate.model,
            unit: rate.metric === 'video' ? 'second' : 'job',
            workspace_id: `${persona.key}-workspace`,
            project_id: `${persona.key}-project-${(slot % 3) + 1}`,
            user_id: isPowerUser
              ? `power-user-seat-${userIndex + 1}`
              : `${persona.key}-user-${userIndex + 1}`,
            ...(selectedPricingValue && pricingDimension
              ? {
                  [pricingDimension.propertyKey]:
                    selectedPricingValue.value,
                }
              : {}),
          },
        });
      }
    }
  }
  for (let offset = 0; offset < events.length; offset += 100) {
    await client.v1.usage.ingest({ usage: events.slice(offset, offset + 100) });
  }
  emit(`Ingested ${events.length} deterministic usage events.`);
  return events.length;
}

async function resetStarter(
  client: Metronome,
  config: StarterConfig,
  confirmed: boolean,
  stripeState?: Pick<
    StarterState,
    'stripeAccountId' | 'stripeCustomers' | 'billingMode'
  > | null,
) {
  const found = await discover(client, config);
  const ownedPackageKeys = new Set(
    found.packages
      .map((pkg) => pkg.uniqueness_key ?? '')
      .filter((key) => key.startsWith(`package:${config.namespace}:`)),
  );
  const ownedPackages = found.packages.filter((pkg) =>
    ownedPackageKeys.has(pkg.uniqueness_key ?? ''),
  );
  const ownsStarterAlias = (alias: string) =>
    alias.startsWith(`${config.namespace}:`);
  const ownedCustomers = found.customers.filter((customer) =>
    (customer.ingest_aliases ?? []).some(ownsStarterAlias),
  );
  const contractRows: Array<{
    customerId: string;
    contractId: string;
    uniquenessKey: string;
  }> = [];
  for (const customer of ownedCustomers) {
    const contracts = await client.v2.contracts.list({
      customer_id: customer.id,
      include_archived: false,
    } as any);
    for (const contract of contracts.data ?? []) {
      const uniquenessKey = String((contract as any).uniqueness_key ?? '');
      contractRows.push({
        customerId: customer.id,
        contractId: contract.id,
        uniquenessKey,
      });
    }
  }
  const summary = {
    contracts: contractRows,
    customers: ownedCustomers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      ingestAliases: customer.ingest_aliases,
    })),
    packages: ownedPackages.map((pkg) => ({ id: pkg.id, name: pkg.name })),
    rateCards: found.rateCard
      ? [{ id: found.rateCard.id, name: found.rateCard.name }]
      : [],
    products: found.products.map((product) => ({
      id: product.id,
      name: product.current.name,
    })),
    metrics: found.metrics.map((metric) => ({
      id: metric.id,
      name: metric.name,
    })),
    retainedPricingUnit: found.pricingUnit
      ? { id: found.pricingUnit.id, name: found.pricingUnit.name }
      : null,
    stripe: stripeState?.stripeCustomers
      ? {
          accountId: stripeState.stripeAccountId,
          customerIds: Object.values(stripeState.stripeCustomers),
          note: 'Finalized Stripe test invoices remain historical after customer deletion.',
        }
      : null,
  };
  emit(
    JSON.stringify(
      {
        mode: confirmed ? 'confirmed-reset' : 'reset-preview',
        namespace: config.namespace,
        summary,
      },
      null,
      2,
    ),
  );
  if (!confirmed) {
    emit(
      `Preview only. Apply with --confirm=${config.namespace}. No resources were changed.`,
    );
    return;
  }

  for (const contract of contractRows) {
    await client.v1.contracts.archive({
      customer_id: contract.customerId,
      contract_id: contract.contractId,
      void_invoices: false,
    });
  }
  for (const customer of ownedCustomers) {
    const remainingAliases = (customer.ingest_aliases ?? []).filter(
      (alias) => !ownsStarterAlias(alias),
    );
    await client.v1.customers.setIngestAliases({
      customer_id: customer.id,
      ingest_aliases: remainingAliases,
    });
    await client.v1.customers.archive({ id: customer.id });
  }
  for (const pkg of ownedPackages) {
    await client.v1.packages.archive({ package_id: pkg.id });
  }
  if (found.rateCard) {
    await client.v1.contracts.rateCards.archive({ id: found.rateCard.id });
  }
  for (const product of found.products) {
    await client.v1.contracts.products.archive({ product_id: product.id });
  }
  for (const metric of found.metrics) {
    await client.v1.billableMetrics.archive({ id: metric.id });
  }
  emit(
    'Starter resources archived. The custom pricing unit is retained because Metronome pricing units are shared account resources.',
  );
}

async function settleStripeInvoices(
  stripe: Stripe,
  customerIds: Record<string, string>,
  createdAfter: number,
): Promise<void> {
  const pending = new Set(Object.values(customerIds));
  for (let attempt = 0; attempt < 30 && pending.size > 0; attempt += 1) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 2000));
    for (const customerId of [...pending]) {
      const [draft, open] = await Promise.all([
        stripe.invoices.list({
          customer: customerId,
          status: 'draft',
          created: { gte: createdAfter },
          limit: 20,
        }),
        stripe.invoices.list({
          customer: customerId,
          status: 'open',
          created: { gte: createdAfter },
          limit: 20,
        }),
      ]);
      const invoices = [...draft.data, ...open.data];
      if (invoices.length === 0) continue;
      for (const invoice of invoices) {
        if (invoice.status === 'draft') {
          await stripe.invoices.finalizeInvoice(invoice.id);
        }
        await stripe.invoices.pay(invoice.id, { off_session: true });
        emit(`Paid Stripe test invoice ${invoice.id}.`);
      }
      pending.delete(customerId);
    }
  }
  if (pending.size > 0) {
    emit(
      `No new Stripe invoice appeared yet for ${pending.size} persona(s); their state is saved for retry.`,
    );
  }
}

let runActive = false;

export async function runStarter(
  options: StarterRunOptions,
): Promise<{ mode: string; statePath?: string }> {
  if (runActive) {
    throw new Error('Another starter operation is already running.');
  }
  runActive = true;
  emit = (...values) =>
    options.onLog?.(
      values
        .map((value) =>
          typeof value === 'string' ? value : JSON.stringify(value, null, 2),
        )
        .join(' '),
    );
  traceSink = options.onTrace;
  metronomeFetch = globalThis.fetch.bind(globalThis);
  try {
    const apiKey = options.apiKey.trim();
    pricingDimension = validatePricingDimension(
      options.pricingDimension === undefined
        ? manifest.pricingDimension
        : options.pricingDimension,
    );
    const config = applyStarterOverrides(manifest as StarterConfig, options);
    if (options.mode === 'validate') {
      emit(
        JSON.stringify(
          { mode: 'validated-config', ...pricingDimensionPreview(config) },
          null,
          2,
        ),
      );
      return { mode: 'validated-config' };
    }
    if (!apiKey) throw new Error('Target Metronome API key is required.');

    enableApiInspectorTracing();
    const client = new Metronome({
      bearerToken: apiKey,
      fetch: metronomeFetch,
    });
    const previousState = await readStarterState(apiKey);
    const requestedBillingMode = options.stripeSecretKey?.trim()
      ? 'stripe'
      : 'metronome-only';
    if (
      options.mode === 'seed' &&
      previousState?.checkpoints?.includes('complete') &&
      previousState.billingMode &&
      previousState.billingMode !== requestedBillingMode
    ) {
      throw new Error(
        `This account was seeded in ${previousState.billingMode} mode. Reset it before switching to ${requestedBillingMode} so package payment gates remain consistent.`,
      );
    }
    if (
      options.mode === 'seed' &&
      previousState?.checkpoints?.includes('complete') &&
      previousState.resourcePrefix &&
      previousState.resourcePrefix !== config.resourcePrefix
    ) {
      throw new Error(
        `This account was seeded with prefix "${previousState.resourcePrefix}". Reset it before changing the prefix.`,
      );
    }
    if (
      options.mode !== 'reset' &&
      options.mode !== 'seed' &&
      options.stripeSecretKey?.trim()
    ) {
      const stripePreflight = await preflightStripe(
        client,
        options.stripeSecretKey.trim(),
        options.deliveryMethodId,
        options.onTrace,
      );
      emit(
        JSON.stringify(
          {
            billingMode: 'stripe',
            stripeAccountId: stripePreflight.stripeAccountId,
            deliveryMethodId:
              stripePreflight.deliveryMethodId ?? 'account default',
            paymentGate: 'Stripe invoice',
          },
          null,
          2,
        ),
      );
    }
    if (options.mode === 'reset') {
      const resetConfig = previousState?.resourcePrefix
        ? applyStarterOverrides(manifest as StarterConfig, {
            ...options,
            resourcePrefix: previousState.resourcePrefix,
          })
        : config;
      let stripeSeed:
        | Omit<StripeSeedContext, 'customerIds'>
        | undefined;
      if (options.stripeSecretKey?.trim()) {
        stripeSeed = await preflightStripe(
          client,
          options.stripeSecretKey.trim(),
          options.deliveryMethodId,
          options.onTrace,
        );
        if (
          previousState?.stripeAccountId &&
          previousState.stripeAccountId !== stripeSeed.stripeAccountId
        ) {
          throw new Error(
            'The Stripe key does not match the account recorded by this starter state.',
          );
        }
      }
      await resetStarter(
        client,
        resetConfig,
        Boolean(options.confirmReset),
        previousState,
      );
      if (
        options.confirmReset &&
        stripeSeed &&
        previousState?.stripeCustomers
      ) {
        for (const customerId of Object.values(
          previousState.stripeCustomers,
        )) {
          try {
            await stripeSeed.stripe.customers.del(customerId);
            emit(`Deleted starter-owned Stripe customer ${customerId}.`);
          } catch (error: any) {
            if (
              error?.code === 'resource_missing' ||
              error?.raw?.code === 'resource_missing' ||
              /no such customer/i.test(String(error?.message ?? ''))
            ) {
              emit(
                `Starter-owned Stripe customer ${customerId} was already deleted.`,
              );
            } else {
              throw error;
            }
          }
        }
        await writeStarterState(apiKey, {
          ...previousState,
          stripeCustomers: {},
          checkpoints: [
            ...(previousState.checkpoints ?? []),
            'reset-complete',
          ],
          generatedAt: new Date().toISOString(),
        });
      }
      return {
        mode: options.confirmReset ? 'reset' : 'reset-preview',
      };
    }
    if (options.mode !== 'seed') {
      await printPlan(client, config);
      return { mode: 'plan' };
    }

    const operationStartedAt = Math.floor(Date.now() / 1000);
    let stripeSeed: StripeSeedContext | undefined;
    let stripeClientForCompensation: Stripe | undefined;
    const createdStripeCustomerIds: string[] = [];
    let state: StarterState = {
      accountScope: fingerprint(apiKey),
      namespace: config.namespace,
      configVersion: config.version,
      resourcePrefix: config.resourcePrefix,
      pricingDimension,
      generatedAt: new Date().toISOString(),
      billingMode: options.stripeSecretKey?.trim()
        ? 'stripe'
        : 'metronome-only',
      checkpoints: ['preflight-metronome'],
    };
    try {
      if (options.stripeSecretKey?.trim()) {
        const preflight = await preflightStripe(
          client,
          options.stripeSecretKey.trim(),
          options.deliveryMethodId,
          options.onTrace,
        );
        stripeClientForCompensation = preflight.stripe;
        if (
          previousState?.stripeAccountId &&
          previousState.stripeAccountId !== preflight.stripeAccountId
        ) {
          throw new Error(
            'The Stripe key does not match the account recorded by this starter state.',
          );
        }
        const stripeCustomerIds = {
          ...(previousState?.stripeCustomers ?? {}),
        };
        state = {
          ...state,
          stripeAccountId: preflight.stripeAccountId,
          deliveryMethodId: preflight.deliveryMethodId,
          stripeCustomers: stripeCustomerIds,
          checkpoints: [...(state.checkpoints ?? []), 'preflight-stripe'],
        };
        await writeStarterState(apiKey, state);
        for (const persona of config.personas) {
          const storedId = stripeCustomerIds[persona.key];
          if (storedId) {
            try {
              const stored = await preflight.stripe.customers.retrieve(
                storedId,
              );
              if (!stored.deleted) continue;
            } catch {
              delete stripeCustomerIds[persona.key];
            }
          }
          emit(`Creating Stripe customer: ${persona.name}`);
          const stripeCustomerId = await createStripePersonaCustomer(
            preflight.stripe,
            persona,
            config.namespace,
          );
          stripeCustomerIds[persona.key] = stripeCustomerId;
          createdStripeCustomerIds.push(stripeCustomerId);
          state = {
            ...state,
            stripeCustomers: { ...stripeCustomerIds },
            checkpoints: [
              ...(state.checkpoints ?? []),
              `stripe-customer:${persona.key}`,
            ],
            generatedAt: new Date().toISOString(),
          };
          await writeStarterState(apiKey, state);
        }
        stripeSeed = { ...preflight, customerIds: stripeCustomerIds };
      }

      const catalog = await ensureCatalog(
        client,
        apiKey,
        config,
        stripeSeed?.deliveryMethod,
      );
      state = {
        ...state,
        pricingUnit: {
          id: catalog.pricingUnitId,
          name: config.pricingUnit.name,
        },
        metrics: catalog.metricIds,
        products: catalog.productIds,
        rateCardId: catalog.rateCardId,
        packages: catalog.packageIds,
        checkpoints: [...(state.checkpoints ?? []), 'catalog'],
      };
      await writeStarterState(apiKey, state);

      const personas = await ensurePersonas(
        client,
        config,
        catalog,
        stripeSeed,
      );
      state = {
        ...state,
        customers: personas.customerIds,
        contracts: personas.contractIds,
        billingConfigurations: personas.billingConfigurationIds,
        checkpoints: [...(state.checkpoints ?? []), 'personas-contracts'],
      };
      await writeStarterState(apiKey, state);
      const eventsIngested = await seedUsage(
        client,
        config,
        personas.customerIds,
      );
      if (stripeSeed) {
        await settleStripeInvoices(
          stripeSeed.stripe,
          stripeSeed.customerIds,
          operationStartedAt,
        );
      }
      state = {
        ...state,
        generatedAt: new Date().toISOString(),
        checkpoints: [...(state.checkpoints ?? []), 'complete'],
      };
      await writeStarterState(apiKey, {
        ...state,
        eventsIngested,
      });
      const statePath = starterStatePath(apiKey);
      emit(
        JSON.stringify(
          {
            mode: 'applied',
            statePath: statePath.replace(`${ROOT}/`, ''),
            state,
            eventsIngested,
          },
          null,
          2,
        ),
      );
      return { mode: 'applied', statePath };
    } catch (error) {
      if (stripeClientForCompensation) {
        for (const customerId of createdStripeCustomerIds) {
          await stripeClientForCompensation.customers
            .del(customerId)
            .catch(() => undefined);
        }
      }
      await writeStarterState(apiKey, {
        ...state,
        checkpoints: [...(state.checkpoints ?? []), 'failed'],
        generatedAt: new Date().toISOString(),
        lastError:
          error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  } finally {
    pricingDimension = null;
    traceSink = undefined;
    emit = (...values) => console.log(...values);
    runActive = false;
  }
}

export async function runStarterFromCli(): Promise<void> {
  if (help) {
    printHelp();
    return;
  }
  if (apply && reset) throw new Error('Choose either --apply or --reset.');
  const apiKey = process.env.METRONOME_API_KEY?.trim();
  if (!apiKey && !validateOnly) {
    throw new Error(
      'METRONOME_API_KEY is required in .env.metronome-target.local.',
    );
  }
  const dimension = resolvePricingDimension();
  await runStarter({
    apiKey: apiKey ?? '',
    mode: validateOnly
      ? 'validate'
      : reset
        ? 'reset'
        : apply
          ? 'seed'
          : 'plan',
    confirmReset: confirmation === manifest.namespace,
    pricingDimension: dimension ?? undefined,
    resourcePrefix:
      process.env.METRONOME_STARTER_RESOURCE_PREFIX?.trim(),
    quickstartName:
      process.env.METRONOME_STARTER_QUICKSTART_NAME?.trim(),
    proName: process.env.METRONOME_STARTER_PRO_NAME?.trim(),
    powerUserName:
      process.env.METRONOME_STARTER_POWER_USER_NAME?.trim(),
    stripeSecretKey: process.env.STRIPE_SECRET_KEY?.trim(),
    deliveryMethodId:
      process.env.METRONOME_DELIVERY_METHOD_ID?.trim(),
    onLog: (line) => console.log(line),
  });
}
