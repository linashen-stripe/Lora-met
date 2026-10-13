import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import Metronome from '@metronome/sdk';

const ROOT = process.cwd();
const MANIFEST_PATH = resolve(
  ROOT,
  'config/metronome/generation-catalog.json',
);
const STATE_PATH = resolve(ROOT, '.metronome/generation-state.json');
const USD_CREDIT_TYPE_ID = '2714e483-4ff1-48e4-9e25-ac732e8f24f2';

type Manifest = {
  version: number;
  namespace: string;
  eventType: string;
  pricingUnit: { name: string; fiatPerCustomCredit: number };
  groupKeys: string[][];
  pricingGroupKey: string[];
  presentationGroupKey: string[];
  metrics: Array<{
    key: string;
    name: string;
    modality: string;
    unit: string;
  }>;
  rates: Array<{
    metric: string;
    operation: string;
    quality: string;
    model: string;
    creditsPerUnit: number;
  }>;
  products: {
    creditGrant: string;
    premiumSubscription: string;
    enterpriseSubscription: string;
  };
  powerUser: {
    prepaidCommitCredits: number;
    prepaidInvoiceCents: number;
    termMonths: number;
    seatCount: number;
    seatMonthlyCredits: number;
    seatMonthlyPriceCents: number;
    usageMultiplier: number;
  };
  rateCard: { name: string; alias: string };
  packages: Array<{
    key: 'free' | 'premium' | 'enterprise';
    name: string;
    includedCredits: number | null;
    monthlyPriceCents: number | null;
    prepaidCommitCredits?: number;
    prepaidInvoiceCents?: number;
    commitDurationMonths?: number;
  }>;
};

type CatalogState = {
  manifestVersion: number;
  generatedAt: string;
  pricingUnit: { id: string; name: string };
  metrics: Record<string, string>;
  products: Record<string, string>;
  rateCardId: string;
  packages: Record<string, string>;
};

const args = new Set(process.argv.slice(2));
const cleanup = args.has('--cleanup');
const apply = args.has('--apply');
const includeCustomers = args.has('--include-customers');
const confirmation = process.argv
  .slice(2)
  .find((arg) => arg.startsWith('--confirm='))
  ?.split('=')[1];

async function listAll<T>(page: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of page) items.push(item);
  return items;
}

async function labeled<T>(label: string, work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label}: ${message}`);
  }
}

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

function packageUniquenessKey(manifest: Manifest, packageKey: string) {
  return `${manifest.namespace}-${packageKey}-v${manifest.version}`;
}

function storedPackageUniquenessKey(manifest: Manifest, packageKey: string) {
  return `package:${packageUniquenessKey(manifest, packageKey)}`;
}

function assertEqual(label: string, actual: unknown, expected: unknown) {
  if (stable(actual) !== stable(expected)) {
    throw new Error(
      `${label} exists but does not match the manifest.\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`,
    );
  }
}

function assertUnorderedArray(
  label: string,
  actual: unknown[],
  expected: unknown[],
) {
  assertEqual(
    label,
    [...actual].sort((a, b) => stable(a).localeCompare(stable(b))),
    [...expected].sort((a, b) => stable(a).localeCompare(stable(b))),
  );
}

async function createPricingUnit(apiKey: string, name: string) {
  const response = await fetch('https://api.metronome.com/v1/credit-types/create', {
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
      `Unable to create custom pricing unit (${response.status}): ${JSON.stringify(body)}`,
    );
  }
  const id = body?.data?.id ?? body?.data;
  if (!id) throw new Error('Metronome returned no custom pricing unit ID');
  return String(id);
}

async function discover(client: Metronome, manifest: Manifest) {
  const [pricingUnits, metrics, products, rateCards, packages, customers] =
    await Promise.all([
      labeled('list pricing units', listAll(client.v1.pricingUnits.list())),
      labeled('list billable metrics', listAll(client.v1.billableMetrics.list())),
      labeled('list products', listAll(
        client.v1.contracts.products.list({
          archive_filter: 'NOT_ARCHIVED',
        }),
      )),
      labeled(
        'list rate cards',
        listAll(client.v1.contracts.rateCards.list({ body: {} })),
      ),
      labeled('list packages', listAll(client.v1.packages.list())),
      includeCustomers
        ? labeled('list customers', listAll(client.v1.customers.list()))
        : Promise.resolve([]),
    ]);

  const names = new Set([
    ...manifest.metrics.map((metric) => metric.name),
    manifest.products.creditGrant,
    manifest.products.premiumSubscription,
    manifest.products.enterpriseSubscription,
  ]);

  return {
    pricingUnit: pricingUnits.find(
      (unit) => !unit.is_currency && unit.name === manifest.pricingUnit.name,
    ),
    metrics: metrics.filter((metric) =>
      manifest.metrics.some((wanted) => wanted.name === metric.name),
    ),
    products: products.filter((product) => names.has(product.current.name)),
    rateCard: rateCards.find(
      (rateCard) => rateCard.name === manifest.rateCard.name,
    ),
    packages: packages.filter(
      (pkg) =>
        !pkg.archived_at &&
        (manifest.packages.some((wanted) => wanted.name === pkg.name) ||
          pkg.uniqueness_key?.startsWith(
            `package:${manifest.namespace}-`,
          )),
    ),
    customers: customers.filter(
      (customer: any) =>
        !customer.archived_at &&
        (customer.name?.startsWith('[Lora Generate]') ||
          customer.ingest_aliases?.some((alias: string) =>
            alias.startsWith('generate:'),
          )),
    ),
  };
}

async function plan(client: Metronome, manifest: Manifest) {
  const found = await discover(client, manifest);
  const currentPackage = (key: string, name: string) =>
    found.packages.find(
      (pkg) =>
        pkg.name === name &&
        pkg.uniqueness_key ===
          storedPackageUniquenessKey(manifest, key),
    );
  const wanted = {
    pricingUnit: manifest.pricingUnit.name,
    metrics: manifest.metrics.map((metric) => metric.name),
    products: [
      ...manifest.metrics.map((metric) => metric.name),
      manifest.products.creditGrant,
      manifest.products.premiumSubscription,
      manifest.products.enterpriseSubscription,
    ],
    rateCard: manifest.rateCard.name,
    packages: manifest.packages.map((pkg) => pkg.name),
  };

  console.log(
    JSON.stringify(
      {
        mode: 'dry-run',
        existing: {
          pricingUnit: found.pricingUnit?.name ?? null,
          metrics: found.metrics.map((metric) => metric.name),
          products: found.products.map((product) => product.current.name),
          rateCard: found.rateCard?.name ?? null,
          packages: found.packages
            .filter((pkg) =>
              manifest.packages.some(
                (wantedPackage) =>
                  currentPackage(wantedPackage.key, wantedPackage.name)?.id ===
                  pkg.id,
              ),
            )
            .map((pkg) => pkg.name),
          outdatedPackages: found.packages
            .filter(
              (pkg) =>
                !manifest.packages.some(
                  (wantedPackage) =>
                    currentPackage(
                      wantedPackage.key,
                      wantedPackage.name,
                    )?.id === pkg.id,
                ),
            )
            .map((pkg) => pkg.name),
        },
        missing: {
          pricingUnit: found.pricingUnit ? null : wanted.pricingUnit,
          metrics: wanted.metrics.filter(
            (name) => !found.metrics.some((metric) => metric.name === name),
          ),
          products: wanted.products.filter(
            (name) =>
              !found.products.some((product) => product.current.name === name),
          ),
          rateCard: found.rateCard ? null : wanted.rateCard,
          packages: wanted.packages.filter(
            (name) => {
              const definition = manifest.packages.find(
                (pkg) => pkg.name === name,
              );
              return (
                !definition ||
                !currentPackage(definition.key, definition.name)
              );
            },
          ),
        },
      },
      null,
      2,
    ),
  );
}

async function seed(
  client: Metronome,
  apiKey: string,
  manifest: Manifest,
): Promise<CatalogState> {
  const found = await discover(client, manifest);

  let pricingUnitId = found.pricingUnit?.id;
  if (!pricingUnitId) {
    console.log(`Creating pricing unit: ${manifest.pricingUnit.name}`);
    pricingUnitId = await createPricingUnit(apiKey, manifest.pricingUnit.name);
  }

  const metricIds: Record<string, string> = {};
  for (const definition of manifest.metrics) {
    const existing = found.metrics.find(
      (metric) => metric.name === definition.name,
    );
    const propertyFilters = [
      { name: 'quantity', exists: true },
      { name: 'modality', exists: true, in_values: [definition.modality] },
      { name: 'operation', exists: true },
      { name: 'quality', exists: true },
      { name: 'model', exists: true },
      { name: 'workspace_id', exists: true },
      { name: 'project_id', exists: true },
      { name: 'user_id', exists: true },
    ];

    if (existing) {
      assertUnorderedArray(
        `${definition.name} group keys`,
        existing.group_keys ?? [],
        manifest.groupKeys,
      );
      assertUnorderedArray(
        `${definition.name} property filters`,
        existing.property_filters ?? [],
        propertyFilters,
      );
      metricIds[definition.key] = existing.id;
      continue;
    }

    console.log(`Creating metric: ${definition.name}`);
    const response = await client.v1.billableMetrics.create({
      name: definition.name,
      aggregation_type: 'SUM',
      aggregation_key: 'quantity',
      event_type_filter: { in_values: [manifest.eventType] },
      property_filters: propertyFilters,
      group_keys: manifest.groupKeys,
    });
    metricIds[definition.key] = response.data.id;
  }

  const productsByName = new Map(
    found.products.map((product) => [product.current.name, product]),
  );
  const productIds: Record<string, string> = {};
  for (const definition of manifest.metrics) {
    const existing = productsByName.get(definition.name);
    if (existing) {
      assertEqual(
        `${definition.name} pricing key`,
        existing.current.pricing_group_key,
        manifest.pricingGroupKey,
      );
      assertEqual(
        `${definition.name} presentation key`,
        existing.current.presentation_group_key,
        manifest.presentationGroupKey,
      );
      productIds[definition.key] = existing.id;
      continue;
    }

    console.log(`Creating usage product: ${definition.name}`);
    const response = await client.v1.contracts.products.create({
      name: definition.name,
      type: 'USAGE',
      billable_metric_id: metricIds[definition.key],
      pricing_group_key: manifest.pricingGroupKey,
      presentation_group_key: manifest.presentationGroupKey,
      tags: [manifest.namespace, 'usage'],
    });
    productIds[definition.key] = response.data.id;
  }

  for (const [key, name, type] of [
    ['creditGrant', manifest.products.creditGrant, 'FIXED'],
    [
      'premiumSubscription',
      manifest.products.premiumSubscription,
      'SUBSCRIPTION',
    ],
    [
      'enterpriseSubscription',
      manifest.products.enterpriseSubscription,
      'SUBSCRIPTION',
    ],
  ] as const) {
    const existing = productsByName.get(name);
    if (existing) {
      productIds[key] = existing.id;
      continue;
    }
    console.log(`Creating ${type.toLowerCase()} product: ${name}`);
    const response = await client.v1.contracts.products.create({
      name,
      type,
      tags: [manifest.namespace],
    });
    productIds[key] = response.data.id;
  }

  let rateCardId = found.rateCard?.id;
  if (!rateCardId) {
    console.log(`Creating rate card: ${manifest.rateCard.name}`);
    const response = await client.v1.contracts.rateCards.create({
      name: manifest.rateCard.name,
      description: 'Lora Generate image, video, and 3D credit pricing.',
      aliases: [{ name: manifest.rateCard.alias }],
      fiat_credit_type_id: USD_CREDIT_TYPE_ID,
      credit_type_conversions: [
        {
          custom_credit_type_id: pricingUnitId,
          fiat_per_custom_credit: manifest.pricingUnit.fiatPerCustomCredit,
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
  for (const rate of manifest.rates) {
    const productId = productIds[rate.metric];
    const pricingGroupValues = {
      operation: rate.operation,
      quality: rate.quality,
      model: rate.model,
    };
    const exists = currentRates.some(
      (current) =>
        current.product_id === productId &&
        stable(current.pricing_group_values) === stable(pricingGroupValues),
    );
    if (!exists) {
      ratesToAdd.push({
        product_id: productId,
        rate_type: 'FLAT',
        price: rate.creditsPerUnit,
        credit_type_id: pricingUnitId,
        pricing_group_values: pricingGroupValues,
        starting_at: '2020-01-01T00:00:00.000Z',
        entitled: true,
      });
    }
  }

  const premium = manifest.packages.find((pkg) => pkg.key === 'premium')!;
  if (
    !currentRates.some(
      (current) =>
        current.product_id === productIds.premiumSubscription &&
        current.billing_frequency === 'MONTHLY',
    )
  ) {
    ratesToAdd.push({
      product_id: productIds.premiumSubscription,
      rate_type: 'FLAT',
      price: premium.monthlyPriceCents,
      credit_type_id: USD_CREDIT_TYPE_ID,
      billing_frequency: 'MONTHLY',
      starting_at: '2020-01-01T00:00:00.000Z',
      entitled: true,
    });
  }
  const enterpriseSeatRate = currentRates.find(
    (current) =>
      current.product_id === productIds.enterpriseSubscription &&
      current.billing_frequency === 'MONTHLY',
  );
  const enterpriseSeatRateStartingAt = new Date();
  enterpriseSeatRateStartingAt.setUTCMinutes(0, 0, 0);
  if (
    !enterpriseSeatRate ||
    Number(enterpriseSeatRate.rate?.price) !==
      manifest.powerUser.seatMonthlyPriceCents
  ) {
    ratesToAdd.push({
      product_id: productIds.enterpriseSubscription,
      rate_type: 'FLAT',
      price: manifest.powerUser.seatMonthlyPriceCents,
      credit_type_id: USD_CREDIT_TYPE_ID,
      billing_frequency: 'MONTHLY',
      starting_at: enterpriseSeatRate
        ? enterpriseSeatRateStartingAt.toISOString()
        : '2020-01-01T00:00:00.000Z',
      entitled: true,
    });
  }

  if (ratesToAdd.length) {
    console.log(`Adding ${ratesToAdd.length} rates`);
    await client.v1.contracts.rateCards.rates.addMany({
      rate_card_id: rateCardId,
      rates: ratesToAdd,
    });
  }

  const packageIds: Record<string, string> = {};
  const usageProductIds = manifest.metrics.map(
    (metric) => productIds[metric.key],
  );
  for (const existing of found.packages) {
    const definition = manifest.packages.find(
      (pkg) => pkg.name === existing.name,
    );
    if (!definition) {
      console.log(`Archiving renamed package: ${existing.name}`);
      await client.v1.packages.archive({ package_id: existing.id });
    }
  }
  for (const definition of manifest.packages) {
    const uniquenessKey = packageUniquenessKey(manifest, definition.key);
    const existing = found.packages.find(
      (pkg) => pkg.name === definition.name,
    );
    if (
      existing &&
      existing.uniqueness_key ===
        storedPackageUniquenessKey(manifest, definition.key)
    ) {
      packageIds[definition.key] = existing.id;
      continue;
    }
    if (existing) {
      console.log(`Archiving outdated package: ${definition.name}`);
      await client.v1.packages.archive({ package_id: existing.id });
    }

    const common = {
      name: definition.name,
      contract_name: definition.name,
      rate_card_id: rateCardId,
      billing_provider: 'stripe' as const,
      delivery_method: 'direct_to_billing_provider' as const,
      uniqueness_key: uniquenessKey,
      billing_anchor_date: 'contract_start_date' as const,
      usage_statement_schedule: {
        frequency: 'MONTHLY' as const,
        day: 'CONTRACT_START' as const,
      },
    };
    let body: any = common;
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
    } else if (definition.key === 'premium') {
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
              product_id: productIds.premiumSubscription,
            },
            initial_quantity: 1,
            quantity_management_mode: 'QUANTITY_ONLY',
          },
        ],
        recurring_credits: [
          {
            product_id: productIds.creditGrant,
            name: 'Monthly generation credits',
            priority: 1,
            rate_type: 'LIST_RATE',
            applicable_product_ids: usageProductIds,
            recurrence_frequency: 'MONTHLY',
            starting_at_offset: { value: 0, unit: 'DAYS' },
            commit_duration: { value: 1, unit: 'PERIODS' },
            proration: 'NONE',
            access_amount: {
              credit_type_id: pricingUnitId,
              unit_price: definition.includedCredits,
              quantity: 1,
            },
          },
        ],
      };
    } else if (definition.key === 'enterprise') {
      if (
        !definition.prepaidCommitCredits ||
        !definition.prepaidInvoiceCents ||
        !definition.commitDurationMonths
      ) {
        throw new Error(
          'Enterprise package requires prepaid commit credits, invoice amount, and duration',
        );
      }
      body = {
        ...common,
        commits: [
          {
            type: 'PREPAID',
            product_id: productIds.creditGrant,
            name: 'Enterprise prepaid generation commitment',
            priority: 1,
            rate_type: 'LIST_RATE',
            applicable_product_ids: usageProductIds,
            access_schedule: {
              credit_type_id: pricingUnitId,
              schedule_items: [
                {
                  amount: definition.prepaidCommitCredits,
                  starting_at_offset: { value: 0, unit: 'DAYS' },
                  duration: {
                    value: definition.commitDurationMonths,
                    unit: 'MONTHS',
                  },
                },
              ],
            },
            invoice_schedule: {
              credit_type_id: USD_CREDIT_TYPE_ID,
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
    }

    console.log(`Creating package: ${definition.name}`);
    const response = await client.v1.packages.create(body);
    packageIds[definition.key] = response.data.id;
  }

  const activeRateCards = await listAll(
    client.v1.contracts.rateCards.list({ body: {} }),
  );
  for (const rateCard of activeRateCards) {
    if (
      rateCard.id !== rateCardId &&
      /^Lora Generate - Standard Rate Card/i.test(rateCard.name)
    ) {
      try {
        console.log(`Archiving superseded rate card: ${rateCard.name}`);
        await client.v1.contracts.rateCards.archive({ id: rateCard.id });
      } catch (error) {
        console.warn(
          `Could not archive superseded rate card ${rateCard.name}:`,
          error,
        );
      }
    }
  }

  const state: CatalogState = {
    manifestVersion: manifest.version,
    generatedAt: new Date().toISOString(),
    pricingUnit: { id: pricingUnitId, name: manifest.pricingUnit.name },
    metrics: metricIds,
    products: productIds,
    rateCardId,
    packages: packageIds,
  };
  await mkdir(dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
  return state;
}

async function cleanupCatalog(client: Metronome, manifest: Manifest) {
  const found = await discover(client, manifest);
  const summary = {
    packages: found.packages.map((pkg) => ({ id: pkg.id, name: pkg.name })),
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
    customers: found.customers.map((customer: any) => ({
      id: customer.id,
      name: customer.name,
      ingest_aliases: customer.ingest_aliases,
    })),
    retainedPricingUnit: found.pricingUnit
      ? { id: found.pricingUnit.id, name: found.pricingUnit.name }
      : null,
  };
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', summary }, null, 2));
  if (!apply) return;
  if (confirmation !== manifest.namespace) {
    throw new Error(
      `Cleanup requires --confirm=${manifest.namespace}. Run without --apply to preview.`,
    );
  }

  for (const pkg of found.packages) {
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
  for (const customer of found.customers as any[]) {
    await client.v1.customers.archive({ id: customer.id });
  }
  console.log('Generation resources archived. Custom pricing units are retained.');
}

async function main() {
  const apiKey = process.env.METRONOME_API_KEY?.trim();
  if (!apiKey) throw new Error('METRONOME_API_KEY is required in .env');
  const manifest = JSON.parse(
    await readFile(MANIFEST_PATH, 'utf8'),
  ) as Manifest;
  const client = new Metronome({ bearerToken: apiKey });

  if (cleanup) {
    await cleanupCatalog(client, manifest);
  } else if (apply) {
    const state = await seed(client, apiKey, manifest);
    console.log(JSON.stringify({ mode: 'applied', state }, null, 2));
  } else {
    await plan(client, manifest);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
