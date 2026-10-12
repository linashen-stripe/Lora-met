import Metronome from '@metronome/sdk';
import Stripe from 'stripe';
import {
  createMetronomeCustomer,
  resolveMetronomeDeliveryMethodIdAsync,
} from './metronome';

// Intentionally self-contained: this file does NOT use the shared
// seedMetronomeUsage utility (metronomeSeedUsage.ts), which is dollar-target
// driven and used by other, unrelated seeding routes (multi-seat,
// multi-project). Power user has its own fixed-event-count usage generator
// below (ingestPowerUserUsageEvents), ported directly from
// complex_billing_demo.py's ingest_events(), so this whole flow is isolated
// end-to-end and can't be affected by (or affect) those other flows.

// Per-seat usage weight + primary API product, ported verbatim from
// complex_billing_demo.py's SEAT_PROFILES. Also doubles as the seat name
// list — distinct from DEMO_METRONOME_USAGE_USER_IDS (4 handles, used by the
// generic seeding tab) — this feature needs exactly 5 seats so the
// "Enterprise Seats" subscription quantity matches the rate card's per-seat
// price ($2,500 × 5 = $12,500).
const SEAT_PROFILES: Record<string, { weight: number; primary: keyof typeof API_PRODUCTS }> = {
  alice: { weight: 4.0, primary: 'chat' },
  bob: { weight: 3.2, primary: 'code_assist' },
  carol: { weight: 2.2, primary: 'chat' },
  dave: { weight: 1.4, primary: 'voice' },
  eve: { weight: 0.5, primary: 'chat' },
};
const POWER_USER_SEAT_NAMES = Object.keys(SEAT_PROFILES);

const API_PRODUCTS = { chat: 'chat', code_assist: 'code_assist', voice: 'realtime_voice' } as const;
const MODELS = ['lora-mythic-4.6', 'lora-prime-5.4', 'lora-prime-mini-5.4'];

// complex_billing_demo.py calls random.seed(42) so its usage numbers are the
// same on every run rather than varying invoice totals/itemization each
// time. Math.random() has no seed hook, so we use a small seeded PRNG
// (mulberry32) fixed to the same seed value for the same determinism —
// every power-user run generates the same usage shape.
const USAGE_RANDOM_SEED = 42;

function createSeededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller transform — JS has no built-in equivalent of Python's random.gauss. */
function gaussianRandom(rand: () => number, mean: number, stdev: number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return mean + stdev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function shuffle<T>(rand: () => number, items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

/**
 * Direct port of complex_billing_demo.py's ingest_events(): same per-seat
 * event-count formula, same slot generation (days_ago 1–27, hours 9–18,
 * minutes :00/:30, shuffled), same event shape. Self-contained — does not
 * call the shared seedMetronomeUsage utility.
 */
async function ingestPowerUserUsageEvents(
  metronome: Metronome,
  customerId: string,
  seatIds: string[],
  domain: string,
): Promise<number> {
  const rand = createSeededRandom(USAGE_RANDOM_SEED);
  const now = new Date();
  const slots: Date[] = [];
  for (let daysAgo = 1; daysAgo <= 27; daysAgo++) {
    for (let hour = 9; hour < 18; hour++) {
      for (const minute of [0, 30]) {
        const slot = new Date(now);
        slot.setUTCDate(slot.getUTCDate() - daysAgo);
        slot.setUTCHours(hour, minute, 0, 0);
        if (slot < now) slots.push(slot);
      }
    }
  }
  shuffle(rand, slots);
  let slotIdx = 0;

  const teamId = `team_${domain.split('.')[0]}`;
  const apiProductKeys = Object.keys(API_PRODUCTS) as (keyof typeof API_PRODUCTS)[];

  const events: Record<string, unknown>[] = [];
  POWER_USER_SEAT_NAMES.forEach((name, seatIndex) => {
    const profile = SEAT_PROFILES[name];
    const userId = seatIds[seatIndex] ?? `${name}@${domain}`;
    const n = Math.max(5, Math.trunc((30 * profile.weight) / 3.5));
    for (let i = 0; i < n && slotIdx < slots.length; i++) {
      const ts = slots[slotIdx++];
      const apiKey =
        rand() < 0.7
          ? profile.primary
          : apiProductKeys[Math.floor(rand() * apiProductKeys.length)];
      const model = MODELS[Math.floor(rand() * MODELS.length)];
      const tier = rand() < 0.75 ? 'standard' : 'batch';
      events.push({
        transaction_id: crypto.randomUUID(),
        customer_id: customerId,
        event_type: 'ai_platform.usage',
        timestamp: ts.toISOString(),
        properties: {
          api_product: API_PRODUCTS[apiKey],
          model,
          processing_tier: tier,
          upstream_provider: 'anthropic',
          project_id: `proj_${name}`,
          team_id: teamId,
          user_id: userId,
          input_tokens: Math.max(1, Math.trunc(Math.abs(gaussianRandom(rand, 5_000_000, 1_300_000)) * profile.weight)),
          output_tokens: Math.max(1, Math.trunc(Math.abs(gaussianRandom(rand, 1_300_000, 340_000)) * profile.weight)),
        },
      });
    }
  });

  for (let i = 0; i < events.length; i += 100) {
    await metronome.v1.usage.ingest({ usage: events.slice(i, i + 100) as any });
  }

  return events.length;
}

// Creates a fully-wired "power user" demo customer: Stripe customer (with a
// tax address), Metronome customer linked to that Stripe customer, a
// commitment + seat-subscription contract on a named rate card, and ~30 days
// of seeded usage. Mirrors complex_billing_demo.py exactly, including its
// fixed-past contract start (so historical periods actually finalize) and
// its per-seat weighted usage generator — reimplemented locally rather than
// via the shared, dollar-target-driven seeding utility, to keep this flow
// fully isolated from other demo seeding routes.

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

async function createStripeCustomerForDemo(
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
  onLog(
    `    ✓ rate card → ${rateCardId}  (currency ${currencyCode}, credit_type ${creditTypeId}, scale x${scale})`,
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
        proration: { invoice_behavior: 'bill_on_next_collection_date', is_prorated: true },
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
        priority: 50,
        rollover_fraction: 0,
        subscription_config: {
          subscription_id: 'seat_sub',
          allocation: 'INDIVIDUAL',
          apply_seat_increase_config: { is_prorated: true },
        },
      },
    ],
  };

  onLog(`\n[4/5] Creating contract...`);
  const contract = await metronome.v1.contracts.create(contractPayload);
  const contractId = contract.data.id;
  onLog(`    ✓ contract → ${contractId}`);

  onLog(`\n[5/5] Ingesting usage events for the past ~27 days...`);
  let eventsIngested: number | undefined;
  try {
    eventsIngested = await ingestPowerUserUsageEvents(metronome, customerId, seatIds, domain);
    onLog(`    ✓ ingested ${eventsIngested} usage events across ${seatIds.length} seats`);
  } catch (error: any) {
    onLog(`    ⚠ usage ingestion failed: ${error?.message ?? 'Unknown error'}`);
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
