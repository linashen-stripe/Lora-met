import Metronome from '@metronome/sdk';
import Stripe from 'stripe';
import { DEMO_MODES } from '@/config/demoModes';
import { DEMO_METRONOME_USAGE_USER_IDS } from '@/config/demoMetronomeUsageSeats';
import generationCatalog from '../../config/metronome/generation-catalog.json';
import {
  createStripeCustomerForDemo,
  resolveRateCardByName,
  resolveProductsByName,
} from '@/utils/demoPowerUser';
import {
  createMetronomeCustomer,
  resolveMetronomeDeliveryMethodIdAsync,
} from '@/utils/metronome';
import { seedGenerationUsage } from '@/utils/metronomeGenerationSeedUsage';

const GENERATION_HISTORY_DAYS = 27;
const GENERATION_PRODUCT_NAMES = {
  prepaidCommit: generationCatalog.products.creditGrant,
  seatCredit: generationCatalog.products.creditGrant,
  enterpriseSubscription:
    generationCatalog.products.enterpriseSubscription,
} as const;

async function resolveGenerationCreditTypeId(
  metronome: Metronome,
): Promise<string> {
  for await (const unit of metronome.v1.pricingUnits.list()) {
    if (
      unit.id &&
      !unit.is_currency &&
      unit.name === generationCatalog.pricingUnit.name
    ) {
      return unit.id;
    }
  }
  throw new Error(
    `${generationCatalog.pricingUnit.name} pricing unit was not found. Seed the Generation catalog first.`,
  );
}

export interface CreateGenerationPowerUserParams {
  metronome: Metronome;
  stripe: Stripe;
  customerName: string;
  deliveryMethodId?: string | null;
  onLog?: (line: string) => void;
}

export interface CreateGenerationPowerUserResult {
  demoMode: 'generation';
  stripeCustomerId: string;
  customerId: string;
  contractId: string;
  currencyCode: string;
  commitAmount: number;
  seatMonthlyAmount: number;
  eventsIngested: number;
  creditsConsumed: number;
}

/**
 * Creates the Generation equivalent of the AI Builder power user: linked
 * Stripe/Metronome customers, a B2B commit + five-seat contract with
 * per-seat credits and negotiated pricing, and deterministic usage history.
 */
export async function createGenerationPowerUser(
  params: CreateGenerationPowerUserParams,
): Promise<CreateGenerationPowerUserResult> {
  const {
    metronome,
    stripe,
    customerName,
    onLog = () => {},
  } = params;
  const displayName = `[${DEMO_MODES.generation.label}] ${customerName}`;
  const emailSlug =
    customerName.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'poweruser';
  const ingestAlias = `${DEMO_MODES.generation.customerPrefix}:${emailSlug}@example.com`;

  onLog('[1/5] Resolving the Generation rate card, products, and credit type...');
  const { rateCardId, creditTypeId: fiatCreditTypeId, currencyCode } =
    await resolveRateCardByName(
      metronome,
      generationCatalog.rateCard.name,
    );
  const generationCreditTypeId =
    await resolveGenerationCreditTypeId(metronome);
  const products = await resolveProductsByName(
    metronome,
    GENERATION_PRODUCT_NAMES,
  );
  onLog(
    `    ✓ rate card → ${rateCardId} (${generationCatalog.pricingUnit.name})`,
  );

  onLog('\n[2/5] Resolving the Stripe delivery method...');
  const deliveryMethodId = await resolveMetronomeDeliveryMethodIdAsync(
    metronome,
    params.deliveryMethodId,
  );
  if (!deliveryMethodId) {
    throw new Error(
      'No Stripe delivery method configured on this Metronome account.',
    );
  }
  onLog(`    ✓ delivery_method_id → ${deliveryMethodId}`);

  onLog('\n[3/5] Creating linked Stripe and Metronome customers...');
  const stripeCustomerId = await createStripeCustomerForDemo(
    stripe,
    displayName,
    currencyCode,
  );
  const customerId = await createMetronomeCustomer(metronome, {
    name: displayName,
    stripeCustomerId,
    deliveryMethodId,
    ingestAliases: [ingestAlias],
  });
  onLog(`    ✓ Stripe customer → ${stripeCustomerId}`);
  onLog(`    ✓ Metronome customer → ${customerId}`);

  // Anchor to the prior month so the historical usage is covered by the
  // contract and monthly seat terms have a complete prior service period.
  const now = new Date();
  const startingAt = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );
  const endingBefore = new Date(startingAt);
  endingBefore.setUTCMonth(
    endingBefore.getUTCMonth() + generationCatalog.powerUser.termMonths,
  );
  const seats = [...DEMO_METRONOME_USAGE_USER_IDS].slice(
    0,
    generationCatalog.powerUser.seatCount,
  );

  const contractPayload: any = {
    customer_id: customerId,
    starting_at: startingAt.toISOString(),
    ending_before: endingBefore.toISOString(),
    rate_card_id: rateCardId,
    name: `${displayName} Annual Commitment`,
    billing_provider_configuration: {
      billing_provider: 'stripe',
      delivery_method: 'direct_to_billing_provider',
    },
    commits: [
      {
        type: 'PREPAID',
        product_id: products.prepaidCommit,
        name: `${generationCatalog.powerUser.prepaidCommitCredits.toLocaleString()} Generation Credit Commit`,
        applicable_product_tags: ['usage'],
        access_schedule: {
          credit_type_id: generationCreditTypeId,
          schedule_items: [
            {
              amount: generationCatalog.powerUser.prepaidCommitCredits,
              starting_at: startingAt.toISOString(),
              ending_before: endingBefore.toISOString(),
            },
          ],
        },
        invoice_schedule: {
          credit_type_id: fiatCreditTypeId,
          schedule_items: [
            {
              timestamp: startingAt.toISOString(),
              unit_price: generationCatalog.powerUser.prepaidInvoiceCents,
              quantity: 1,
            },
          ],
        },
      },
    ],
    overrides: [
      {
        starting_at: startingAt.toISOString(),
        applicable_product_tags: ['usage'],
        type: 'MULTIPLIER',
        multiplier: generationCatalog.powerUser.usageMultiplier,
      },
      {
        starting_at: startingAt.toISOString(),
        product_id: products.enterpriseSubscription,
        type: 'OVERWRITE',
        overwrite_rate: {
          rate_type: 'FLAT',
          credit_type_id: fiatCreditTypeId,
          price: generationCatalog.powerUser.seatMonthlyPriceCents,
        },
      },
    ],
    subscriptions: [
      {
        collection_schedule: 'advance',
        proration: {
          invoice_behavior: 'bill_on_next_collection_date',
          is_prorated: false,
        },
        subscription_rate: {
          billing_frequency: 'monthly',
          product_id: products.enterpriseSubscription,
        },
        name: `${displayName} Enterprise Seats`,
        quantity_management_mode: 'SEAT_BASED',
        seat_config: {
          initial_seat_ids: seats,
          seat_group_key: 'user_id',
        },
        temporary_id: 'seat_sub',
      },
    ],
    recurring_credits: [
      {
        product_id: products.seatCredit,
        name: 'Monthly Generation Credits per Seat',
        starting_at: startingAt.toISOString(),
        ending_before: endingBefore.toISOString(),
        access_amount: {
          credit_type_id: generationCreditTypeId,
          unit_price: generationCatalog.powerUser.seatMonthlyCredits,
        },
        commit_duration: { value: 1, unit: 'PERIODS' },
        recurrence_frequency: 'MONTHLY',
        priority: 50,
        rollover_fraction: 0,
        subscription_config: {
          subscription_id: 'seat_sub',
          allocation: 'INDIVIDUAL',
          apply_seat_increase_config: { is_prorated: false },
        },
      },
    ],
  };

  onLog('\n[4/5] Creating the Generation B2B power-user contract...');
  const contract = await metronome.v1.contracts.create(contractPayload);
  const contractId = contract.data.id;
  onLog(`    ✓ contract → ${contractId}`);
  onLog(
    `    ✓ ${seats.length} seats, ${generationCatalog.powerUser.seatMonthlyCredits.toLocaleString()} monthly credits/seat, ${Math.round((1 - generationCatalog.powerUser.usageMultiplier) * 100)}% usage discount`,
  );

  onLog('\n[5/5] Seeding Generation usage by user and project...');
  const usage = await seedGenerationUsage({
    metronome,
    customerId,
    story: 'healthy',
    lookbackDays: GENERATION_HISTORY_DAYS - 1,
    trailingUnseededDays: 1,
    commitmentSpendCapFraction: 0.05,
    userWeights: [8, 6, 4, 3, 1],
  });
  onLog(
    `    ✓ ingested ${usage.eventsIngested} events consuming ${usage.creditsConsumed.toLocaleString()} Generation Credits`,
  );

  return {
    demoMode: 'generation',
    stripeCustomerId,
    customerId,
    contractId,
    currencyCode,
    commitAmount: generationCatalog.powerUser.prepaidCommitCredits,
    seatMonthlyAmount: generationCatalog.powerUser.seatMonthlyCredits,
    eventsIngested: usage.eventsIngested,
    creditsConsumed: usage.creditsConsumed,
  };
}
