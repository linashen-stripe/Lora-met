import Metronome from '@metronome/sdk';
import Stripe from 'stripe';
import aiBuilderManifest from '../../config/metronome/ai-builder-starter.json';
import {
  createMetronomeCustomer,
  resolveMetronomeDeliveryMethodIdAsync,
} from './metronome';
import {
  AI_BUILDER_SEED_EVENT_REVISION,
  SEED_USAGE_MULTI_PROJECT_IDS,
  SEED_USAGE_MULTI_PROJECT_SPEND_SHARES,
  seedMetronomeUsage,
} from './metronomeSeedUsage';
import {
  assertB2bSeatTargets,
  b2bSeatConsumptionTargets,
  demoB2bContractStart,
  demoB2bUsageStart,
  listRateTargetsForConsumption,
  type DemoUsageStory,
} from './demoUsageSeedProfiles';
import { DEMO_METRONOME_USAGE_USER_IDS } from '@/config/demoMetronomeUsageSeats';

async function ingestPowerUserUsageEvents(
  metronome: Metronome,
  customerId: string,
  contractId: string,
  seatIds: string[],
  seatMonthlyDollars: number,
  discount: number,
  story: DemoUsageStory,
): Promise<number> {
  const consumptionTargets = b2bSeatConsumptionTargets(
    seatMonthlyDollars,
    story,
  );
  assertB2bSeatTargets(seatMonthlyDollars, consumptionTargets);
  const listRateTargets = listRateTargetsForConsumption(
    consumptionTargets,
    discount,
  );
  const result = await seedMetronomeUsage({
    metronome,
    customerId,
    contractId,
    story,
    logLabel: '[power-user-seed]',
    trailingUnseededDays: 1,
    seedStartOverride: demoB2bUsageStart(),
    perUserTargetSpendDollars: listRateTargets,
    seedRunKey: `${contractId}:${AI_BUILDER_SEED_EVENT_REVISION}`,
    projectAttribution: {
      mode: 'multi',
      projects: SEED_USAGE_MULTI_PROJECT_IDS.map((projectId, index) => ({
        projectId,
        spendShare: SEED_USAGE_MULTI_PROJECT_SPEND_SHARES[index]!,
      })),
    },
    transactionIdPrefix: 'seed-mp',
    usageUserIds: seatIds,
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.eventsIngested;
}

// Creates a fully-wired "power user" demo customer: Stripe customer (with a
// tax address), Metronome customer linked to that Stripe customer, a
// commitment + seat-subscription contract on a named rate card, and ~30 days
// of seeded usage. The shared dollar-targeted seeder deliberately drives one
// seat beyond its monthly allotment while leaving varied balances on the
// other four seats.

export const DEFAULT_RATE_CARD_NAME = 'Lora AI Standard Rate Card';
export const CANONICAL_RATE_CARD_NAME = aiBuilderManifest.rateCard.name;

export const DEFAULT_PRODUCT_NAMES = {
  prepaidCommit: 'Prepaid Commit',
  seatCredit: 'Seat-based Credit',
  enterpriseSubscription: 'Enterprise Subscription',
} as const;
export const CANONICAL_PRODUCT_NAMES = {
  prepaidCommit: aiBuilderManifest.products.prepaidCommit,
  seatCredit: aiBuilderManifest.products.seatCredit,
  enterpriseSubscription: aiBuilderManifest.products.enterpriseSubscription,
} as const;

export const DEFAULT_COMMIT_DOLLARS = 100_000;
export const DEFAULT_SEAT_MONTHLY_DOLLARS = 2_000;
export const DEFAULT_DISCOUNT = 0.85;

// Stripe customer address, phone, and default test card token, keyed to the
// rate card's currency's ISO code (e.g. "USD", "AUD" — parsed out of credit
// type names like "USD (Cents)").
const STRIPE_LOCALE_BY_CURRENCY: Record<
  string,
  { address: Stripe.AddressParam; phone: string; testCardToken: string }
> = {
  USD: {
    address: {
      line1: '47 W 13th St',
      line2: '',
      city: 'New York',
      state: 'NY',
      postal_code: '10011',
      country: 'US',
    },
    phone: '+12015550123',
    testCardToken: 'tok_visa',
  },
  AUD: {
    address: {
      line1: '1 Bligh Street',
      line2: '',
      city: 'Sydney',
      state: 'NSW',
      postal_code: '2000',
      country: 'AU',
    },
    phone: '+61255501234',
    testCardToken: 'tok_au',
  },
};

// Metronome amounts are entered in the credit type's minor unit. Credit
// types whose name flags them as cents-denominated (e.g. "USD (Cents)") use
// x100; everything else (e.g. plain "AUD") is entered directly in whole
// currency units, per this sandbox's convention.
function currencyCodeAndScale(creditTypeName: string): { code: string; scale: number } {
  const upper = creditTypeName.toUpperCase();
  const code = upper.match(/[A-Z]{3}/)?.[0] ?? 'USD';
  const scale = upper.includes('CENT') ? 100 : 1;
  return { code, scale };
}

export interface ResolvedRateCard {
  rateCardId: string;
  rateCardName: string;
  creditTypeId: string;
  currencyCode: string;
  scale: number;
}

export async function resolveRateCardByName(
  metronome: Metronome,
  rateCardName: string,
): Promise<ResolvedRateCard> {
  return resolveRateCardByNames(metronome, [rateCardName]);
}

async function resolveRateCardByNames(
  metronome: Metronome,
  rateCardNames: readonly string[],
): Promise<ResolvedRateCard> {
  const acceptedNames = new Set(rateCardNames);
  for await (const rc of metronome.v1.contracts.rateCards.list({ body: {} })) {
    if (acceptedNames.has(rc.name)) {
      const creditType = (rc as any).fiat_credit_type;
      const { code, scale } = currencyCodeAndScale(creditType?.name ?? 'USD');
      return {
        rateCardId: rc.id,
        rateCardName: rc.name,
        creditTypeId: creditType.id,
        currencyCode: code,
        scale,
      };
    }
  }
  throw new Error(
    `No supported rate card found. Expected one of: ${rateCardNames.join(', ')}.`,
  );
}

export async function resolveProductsByName(
  metronome: Metronome,
  productNames: Record<string, string>,
): Promise<Record<string, string>> {
  const byName = new Map<string, string>();
  for await (const product of metronome.v1.contracts.products.list({
    archive_filter: 'NOT_ARCHIVED',
  })) {
    if (product.current?.name) byName.set(product.current.name, product.id);
  }

  const resolved: Record<string, string> = {};
  const missing: string[] = [];
  for (const [key, name] of Object.entries(productNames)) {
    const id = byName.get(name);
    if (id) resolved[key] = id;
    else missing.push(name);
  }
  if (missing.length > 0) {
    throw new Error(`Missing product(s) on this account: ${missing.join(', ')}`);
  }
  return resolved;
}

async function resolveUsageProductIds(
  metronome: Metronome,
  rateCardId: string,
  nonUsageProductIds: string[],
): Promise<string[]> {
  const excluded = new Set(nonUsageProductIds);
  const usageProductIds = new Set<string>();
  for await (const rate of metronome.v1.contracts.rateCards.rates.list({
    rate_card_id: rateCardId,
    at: new Date().toISOString(),
  })) {
    const productId = (rate as any).product_id;
    if (productId && !excluded.has(productId)) {
      usageProductIds.add(productId);
    }
  }
  if (usageProductIds.size === 0) {
    throw new Error(`No metered usage products found on rate card ${rateCardId}.`);
  }
  return [...usageProductIds];
}

export async function createStripeCustomerForDemo(
  stripe: Stripe,
  customerName: string,
  currencyCode: string,
): Promise<string> {
  const locale = STRIPE_LOCALE_BY_CURRENCY[currencyCode.toUpperCase()];
  if (!locale) {
    throw new Error(
      `No Stripe address configured for currency "${currencyCode}". Add an entry to STRIPE_LOCALE_BY_CURRENCY.`,
    );
  }
  const email = `${customerName.toLowerCase().replace(/[^a-z0-9]+/g, '')}@example.com`;
  const customer = await stripe.customers.create({
    name: customerName,
    email,
    phone: locale.phone,
    address: locale.address,
    shipping: { name: customerName, phone: locale.phone, address: locale.address },
  });

  const paymentMethod = await stripe.paymentMethods.create({
    type: 'card',
    card: { token: locale.testCardToken },
  });
  await stripe.paymentMethods.attach(paymentMethod.id, { customer: customer.id });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: paymentMethod.id },
  });

  return customer.id;
}

export interface CreatePowerUserDemoCustomerParams {
  metronome: Metronome;
  stripe: Stripe;
  customerName: string;
  rateCardName?: string;
  productNames?: Record<string, string>;
  commitDollars?: number;
  seatMonthlyDollars?: number;
  discount?: number;
  story?: DemoUsageStory;
  deliveryMethodId?: string | null;
  seatIds?: string[];
  /** Called with a line of progress output as each step completes (for terminal-style UIs). */
  onLog?: (line: string) => void;
  /**
   * Lets interactive callers return as soon as the contract exists and run
   * the comparatively slow usage seed after navigation. Batch/admin callers
   * can omit this to retain the original synchronous behavior.
   */
  deferUsageSeed?: (
    customerId: string,
    seedUsage: () => Promise<number>,
  ) => void;
}

export interface CreatePowerUserDemoCustomerResult {
  stripeCustomerId: string;
  customerId: string;
  contractId: string;
  currencyCode: string;
  commitAmount: number;
  seatMonthlyAmount: number;
  eventsIngested?: number;
}

export async function createPowerUserDemoCustomer(
  params: CreatePowerUserDemoCustomerParams,
): Promise<CreatePowerUserDemoCustomerResult> {
  const {
    metronome,
    stripe,
    customerName,
    rateCardName,
    productNames,
    commitDollars = DEFAULT_COMMIT_DOLLARS,
    seatMonthlyDollars = DEFAULT_SEAT_MONTHLY_DOLLARS,
    discount = DEFAULT_DISCOUNT,
    story = 'healthy',
    onLog = () => {},
    deferUsageSeed,
  } = params;

  const seatIds =
    params.seatIds ??
    [...DEMO_METRONOME_USAGE_USER_IDS].slice(
      0,
      aiBuilderManifest.powerUser.seatCount,
    );

  onLog(`[1/5] Resolving Stripe delivery method on this Metronome account...`);
  const deliveryMethodId = await resolveMetronomeDeliveryMethodIdAsync(
    metronome,
    params.deliveryMethodId,
  );
  if (!deliveryMethodId) {
    throw new Error(
      'No Stripe delivery method configured on this Metronome account. Connect Stripe under Metronome settings, or set METRONOME_DELIVERY_METHOD_ID.',
    );
  }
  onLog(`    ✓ delivery_method_id → ${deliveryMethodId}`);

  const rateCardCandidates = rateCardName
    ? [rateCardName]
    : [CANONICAL_RATE_CARD_NAME, DEFAULT_RATE_CARD_NAME];
  onLog(
    `\n[2/5] Resolving AI Builder rate card (${rateCardCandidates.join(' or ')}) + products by name...`,
  );
  const {
    rateCardId,
    rateCardName: resolvedRateCardName,
    creditTypeId,
    currencyCode,
    scale,
  } = await resolveRateCardByNames(metronome, rateCardCandidates);
  const resolvedProductNames =
    productNames ??
    (resolvedRateCardName === CANONICAL_RATE_CARD_NAME
      ? CANONICAL_PRODUCT_NAMES
      : DEFAULT_PRODUCT_NAMES);
  const products = await resolveProductsByName(
    metronome,
    resolvedProductNames,
  );
  const usageProductIds = await resolveUsageProductIds(
    metronome,
    rateCardId,
    Object.values(products),
  );
  onLog(
    `    ✓ ${resolvedRateCardName} → ${rateCardId}  (${usageProductIds.length} usage products, currency ${currencyCode}, credit_type ${creditTypeId}, scale x${scale})`,
  );

  onLog(`\n[3/5] Creating Stripe customer + Metronome customer...`);
  const stripeCustomerId = await createStripeCustomerForDemo(
    stripe,
    customerName,
    currencyCode,
  );
  onLog(`    ✓ Stripe customer '${customerName}' → ${stripeCustomerId}`);

  const customerId = await createMetronomeCustomer(metronome, {
    name: customerName,
    stripeCustomerId,
    deliveryMethodId,
    stripeCollectionMethod: 'send_invoice',
  });
  onLog(`    ✓ Metronome customer '${customerName}' → ${customerId}`);

  const commitAmount = commitDollars * scale;
  const seatMonthlyAmount = seatMonthlyDollars * scale;

  // Calendar-month alignment keeps the current seeded usage inside the active
  // monthly per-seat credit period while preserving non-prorated billing.
  const startingAt = demoB2bContractStart();
  const endingBefore = new Date(startingAt);
  endingBefore.setUTCFullYear(endingBefore.getUTCFullYear() + 1);

  // B2B CREDIT ORDERING:
  // - every usage product is tagged `usage` by AI Builder account setup;
  // - the per-seat recurring credit (priority 1, INDIVIDUAL) burns first;
  // - excess seat usage then falls through to the shared annual commitment;
  // - the same tag scopes the negotiated 15% usage multiplier.
  // Do not replace this with unscoped credits or unrelated product ids.
  const contractPayload: any = {
    customer_id: customerId,
    starting_at: startingAt.toISOString(),
    ending_before: endingBefore.toISOString(),
    rate_card_id: rateCardId,
    name: `${customerName} Annual Commitment`,
    billing_provider_configuration: {
      billing_provider: 'stripe',
      delivery_method: 'direct_to_billing_provider',
    },
    commits: [
      {
        type: 'PREPAID',
        product_id: products.prepaidCommit,
        name: `$${(commitDollars / 1000).toFixed(0)}k Annual Commit`,
        priority: 100,
        applicable_product_tags: ['usage'],
        access_schedule: {
          credit_type_id: creditTypeId,
          schedule_items: [
            {
              amount: commitAmount,
              starting_at: startingAt.toISOString(),
              ending_before: endingBefore.toISOString(),
            },
          ],
        },
        invoice_schedule: {
          credit_type_id: creditTypeId,
          schedule_items: [
            { timestamp: startingAt.toISOString(), unit_price: commitAmount, quantity: 1 },
          ],
        },
      },
    ],
    overrides: [
      {
        starting_at: startingAt.toISOString(),
        applicable_product_tags: ['usage'],
        type: 'MULTIPLIER',
        multiplier: discount,
      },
    ],
    subscriptions: [
      {
        collection_schedule: 'advance',
        starting_at: startingAt.toISOString(),
        ending_before: endingBefore.toISOString(),
        proration: {
          invoice_behavior: 'bill_on_next_collection_date',
          is_prorated: false,
        },
        subscription_rate: {
          billing_frequency: 'monthly',
          product_id: products.enterpriseSubscription,
        },
        name: `${customerName} Enterprise Seats`,
        quantity_management_mode: 'SEAT_BASED',
        seat_config: { initial_seat_ids: seatIds, seat_group_key: 'user_id' },
        temporary_id: 'seat_sub',
      },
    ],
    recurring_credits: [
      {
        product_id: products.seatCredit,
        name: 'Monthly Seat Allotment',
        starting_at: startingAt.toISOString(),
        ending_before: endingBefore.toISOString(),
        access_amount: { credit_type_id: creditTypeId, unit_price: seatMonthlyAmount },
        commit_duration: { value: 1, unit: 'PERIODS' },
        recurrence_frequency: 'MONTHLY',
        proration: 'NONE',
        priority: 1,
        rollover_fraction: 0,
        applicable_product_tags: ['usage'],
        subscription_config: {
          subscription_id: 'seat_sub',
          allocation: 'INDIVIDUAL',
          apply_seat_increase_config: { is_prorated: false },
        },
      },
    ],
  };

  onLog(`\n[4/5] Creating contract...`);
  const contract = await metronome.v1.contracts.create(contractPayload);
  const contractId = contract.data.id;
  onLog(`    ✓ contract → ${contractId}`);

  const seedUsage = () =>
    ingestPowerUserUsageEvents(
      metronome,
      customerId,
      contractId,
      seatIds,
      seatMonthlyDollars,
      discount,
      story,
    );

  let eventsIngested: number | undefined;
  if (deferUsageSeed) {
    // The Plans page owns progress once the contract is ready; do not retain
    // the NDJSON stream while Metronome ingests and aggregates demo usage.
    deferUsageSeed(customerId, seedUsage);
    onLog(`\n[5/5] Usage seeding will continue on Plans & Billing.`);
  } else {
    onLog(`\n[5/5] Ingesting usage events for the past ~27 days...`);
    try {
      eventsIngested = await seedUsage();
      onLog(`    ✓ ingested ${eventsIngested} usage events across ${seatIds.length} seats`);
    } catch (error: any) {
      onLog(`    ⚠ usage ingestion failed: ${error?.message ?? 'Unknown error'}`);
    }
  }

  return {
    stripeCustomerId,
    customerId,
    contractId,
    currencyCode,
    commitAmount,
    seatMonthlyAmount,
    ...(eventsIngested !== undefined ? { eventsIngested } : {}),
  };
}
