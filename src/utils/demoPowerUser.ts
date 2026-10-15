import Metronome from '@metronome/sdk';
import Stripe from 'stripe';
import {
  createMetronomeCustomer,
  resolveMetronomeDeliveryMethodIdAsync,
} from './metronome';
import {
  SEED_USAGE_MULTI_PROJECT_IDS,
  SEED_USAGE_MULTI_PROJECT_SPEND_SHARES,
  seedMetronomeUsage,
} from './metronomeSeedUsage';

const POWER_USER_SEAT_NAMES = ['alice', 'bob', 'carol', 'dave', 'eve'];

async function ingestPowerUserUsageEvents(
  metronome: Metronome,
  customerId: string,
  contractId: string,
  seatIds: string[],
  targetSpendDollars: number,
): Promise<number> {
  const result = await seedMetronomeUsage({
    metronome,
    customerId,
    contractId,
    story: 'healthy',
    logLabel: '[power-user-seed]',
    trailingUnseededDays: 1,
    targetSpendDollars,
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

export const DEFAULT_PRODUCT_NAMES = {
  prepaidCommit: 'Prepaid Commit',
  seatCredit: 'Seat-based Credit',
  enterpriseSubscription: 'Enterprise Subscription',
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
  creditTypeId: string;
  currencyCode: string;
  scale: number;
}

export async function resolveRateCardByName(
  metronome: Metronome,
  rateCardName: string,
): Promise<ResolvedRateCard> {
  for await (const rc of metronome.v1.contracts.rateCards.list({ body: {} })) {
    if (rc.name === rateCardName) {
      const creditType = (rc as any).fiat_credit_type;
      const { code, scale } = currencyCodeAndScale(creditType?.name ?? 'USD');
      return {
        rateCardId: rc.id,
        creditTypeId: creditType.id,
        currencyCode: code,
        scale,
      };
    }
  }
  throw new Error(`No rate card named "${rateCardName}" found on this account.`);
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
    rateCardName = DEFAULT_RATE_CARD_NAME,
    productNames = DEFAULT_PRODUCT_NAMES,
    commitDollars = DEFAULT_COMMIT_DOLLARS,
    seatMonthlyDollars = DEFAULT_SEAT_MONTHLY_DOLLARS,
    discount = DEFAULT_DISCOUNT,
    onLog = () => {},
    deferUsageSeed,
  } = params;

  const domain = `${customerName.toLowerCase().replace(/[^a-z0-9]+/g, '')}.ai`;
  const seatIds = params.seatIds ?? POWER_USER_SEAT_NAMES.map((n) => `${n}@${domain}`);

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

  onLog(`\n[2/5] Resolving rate card "${rateCardName}" + products by name...`);
  const { rateCardId, creditTypeId, currencyCode, scale } =
    await resolveRateCardByName(metronome, rateCardName);
  const products = await resolveProductsByName(metronome, productNames);
  const usageProductIds = await resolveUsageProductIds(
    metronome,
    rateCardId,
    Object.values(products),
  );
  onLog(
    `    ✓ rate card → ${rateCardId}  (${usageProductIds.length} usage products, currency ${currencyCode}, credit_type ${creditTypeId}, scale x${scale})`,
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
  });
  onLog(`    ✓ Metronome customer '${customerName}' → ${customerId}`);

  const commitAmount = commitDollars * scale;
  const seatMonthlyAmount = seatMonthlyDollars * scale;

  // complex_billing_demo.py hardcodes CONTRACT_START to midnight UTC on the
  // 1st of a month ("2026-07-01T00:00:00Z") — both well in the past (so the
  // ~27 days of seeded usage finalize inside an already-elapsed period) AND
  // exactly on a monthly period boundary. That boundary alignment matters:
  // it's why the $100k commit invoice (fired at starting_at) and the first
  // month's seat subscription charge (billed in advance at the same instant)
  // land on the same invoice instead of the commit invoicing alone and the
  // seats invoicing separately for a short stub period. We mirror both
  // properties by anchoring to midnight UTC on the 1st of the prior month.
  const now = new Date();
  const startingAt = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0),
  );
  const endingBefore = new Date(startingAt);
  endingBefore.setUTCFullYear(endingBefore.getUTCFullYear() + 1);

  // B2B CREDIT ORDERING:
  // - every usage product is tagged `usage` by AI Builder account setup;
  // - the per-seat recurring credit (priority 50, INDIVIDUAL) burns first;
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
        priority: 50,
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
      // Only the current-month slice can consume the active monthly seat
      // allotment. This full-window target leaves enough current-month spend
      // for the single heavy seat to cross $2k, while every other seat remains
      // well below its individual allocation.
      seatMonthlyDollars * 7.5,
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
