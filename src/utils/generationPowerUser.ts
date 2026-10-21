import Metronome from '@metronome/sdk';
import Stripe from 'stripe';
import { DEMO_MODES } from '@/config/demoModes';
import { DEMO_METRONOME_USAGE_USER_IDS } from '@/config/demoMetronomeUsageSeats';
import { METRONOME_CATALOG } from '@/config/metronomeCatalog';
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
import {
  assertB2bSeatTargets,
  b2bSeatConsumptionTargets,
  demoB2bContractStart,
  demoB2bCurrentPeriodLookbackDays,
  expectedB2bSpillSeatCount,
  type DemoUsageStory,
} from '@/utils/demoUsageSeedProfiles';

const GENERATION_PRODUCT_NAMES = {
  prepaidCommit: METRONOME_CATALOG.products.creditGrant,
  seatCredit: METRONOME_CATALOG.products.creditGrant,
  enterpriseSubscription:
    METRONOME_CATALOG.products.enterpriseSeat,
} as const;

async function resolveGenerationCreditTypeId(
  metronome: Metronome,
): Promise<string> {
  for await (const unit of metronome.v1.pricingUnits.list()) {
    if (
      unit.id &&
      !unit.is_currency &&
      unit.name === METRONOME_CATALOG.pricingUnit.name
    ) {
      return unit.id;
    }
  }
  throw new Error(
    `${METRONOME_CATALOG.pricingUnit.name} pricing unit was not found. Seed the Generation catalog first.`,
  );
}

export interface CreateGenerationPowerUserParams {
  metronome: Metronome;
  stripe: Stripe;
  customerName: string;
  deliveryMethodId?: string | null;
  story?: DemoUsageStory;
  onLog?: (line: string) => void;
  deferUsageSeed?: (
    customerId: string,
    seedUsage: () => Promise<{
      eventsIngested: number;
      creditsConsumed: number;
    }>,
  ) => void;
}

export interface CreateGenerationPowerUserResult {
  demoMode: 'generation';
  stripeCustomerId: string;
  customerId: string;
  contractId: string;
  currencyCode: string;
  commitAmount: number;
  seatMonthlyAmount: number;
  eventsIngested?: number;
  creditsConsumed?: number;
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
    story = 'healthy',
    onLog = () => {},
    deferUsageSeed,
  } = params;
  const displayName = `[${DEMO_MODES.generation.label}] ${customerName}`;
  const emailSlug =
    customerName.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'poweruser';
  const ingestAlias = `${DEMO_MODES.generation.customerPrefix}:${emailSlug}@example.com`;

  onLog('[1/5] Resolving the Generation rate card, products, and credit type...');
  const { rateCardId, creditTypeId: fiatCreditTypeId, currencyCode } =
    await resolveRateCardByName(
      metronome,
      METRONOME_CATALOG.rateCard.name,
    );
  const generationCreditTypeId =
    await resolveGenerationCreditTypeId(metronome);
  const products = await resolveProductsByName(
    metronome,
    GENERATION_PRODUCT_NAMES,
  );
  onLog(
    `    ✓ rate card → ${rateCardId} (${METRONOME_CATALOG.pricingUnit.name})`,
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
    stripeCollectionMethod: 'send_invoice',
  });
  onLog(`    ✓ Stripe customer → ${stripeCustomerId}`);
  onLog(`    ✓ Metronome customer → ${customerId}`);

  // Align B2B terms to calendar-month seat-credit periods.
  const startingAt = demoB2bContractStart();
  const endingBefore = new Date(startingAt);
  endingBefore.setUTCMonth(
    endingBefore.getUTCMonth() + METRONOME_CATALOG.powerUser.durationMonths,
  );
  const seats = [...DEMO_METRONOME_USAGE_USER_IDS].slice(
    0,
    METRONOME_CATALOG.powerUser.seatCount,
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
        name: `${METRONOME_CATALOG.powerUser.annualCommitCredits.toLocaleString()} Generation Credit Commit`,
        applicable_product_tags: ['usage'],
        access_schedule: {
          credit_type_id: generationCreditTypeId,
          schedule_items: [
            {
              amount: METRONOME_CATALOG.powerUser.annualCommitCredits,
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
              unit_price: METRONOME_CATALOG.powerUser.annualCommitCents,
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
        multiplier: METRONOME_CATALOG.powerUser.usageMultiplier,
      },
      {
        starting_at: startingAt.toISOString(),
        override_specifiers: [
          {
            product_id: products.enterpriseSubscription,
            billing_frequency: 'MONTHLY',
          },
        ],
        type: 'OVERWRITE',
        overwrite_rate: {
          rate_type: 'FLAT',
          credit_type_id: fiatCreditTypeId,
          price: METRONOME_CATALOG.powerUser.seatMonthlyCents,
        },
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
          unit_price: METRONOME_CATALOG.powerUser.seatMonthlyCredits,
        },
        commit_duration: { value: 1, unit: 'PERIODS' },
        recurrence_frequency: 'MONTHLY',
        proration: 'NONE',
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
    `    ✓ ${seats.length} seats, ${METRONOME_CATALOG.powerUser.seatMonthlyCredits.toLocaleString()} monthly credits/seat, ${Math.round((1 - METRONOME_CATALOG.powerUser.usageMultiplier) * 100)}% usage discount`,
  );

  const seatConsumptionTargets = b2bSeatConsumptionTargets(
    METRONOME_CATALOG.powerUser.seatMonthlyCredits,
    story,
  );
  assertB2bSeatTargets(
    METRONOME_CATALOG.powerUser.seatMonthlyCredits,
    seatConsumptionTargets,
    expectedB2bSpillSeatCount(story),
  );
  const seedUsage = () =>
    seedGenerationUsage({
      metronome,
      customerId,
      story,
      lookbackDays: demoB2bCurrentPeriodLookbackDays(),
      trailingUnseededDays: 0,
      usageUserIds: seats,
      // Targets are post-discount Generation Credits. The seeder converts them
      // back to list-rate event credits before applying the 0.85 contract
      // multiplier, preserving custom-credit units end to end.
      perUserTargetCredits: seatConsumptionTargets,
      usageMultiplier: METRONOME_CATALOG.powerUser.usageMultiplier,
      seedRunKey: contractId,
    });

  let usage:
    | { eventsIngested: number; creditsConsumed: number }
    | undefined;
  if (deferUsageSeed) {
    // The Plans page owns progress once the contract is ready; do not retain
    // the NDJSON stream while Metronome ingests and aggregates demo usage.
    deferUsageSeed(customerId, seedUsage);
    onLog('\n[5/5] Usage seeding will continue on Plans & Billing.');
  } else {
    onLog('\n[5/5] Seeding Generation usage by user and project...');
    usage = await seedUsage();
    onLog(
      `    ✓ ingested ${usage.eventsIngested} events consuming ${usage.creditsConsumed.toLocaleString()} Generation Credits`,
    );
  }

  return {
    demoMode: 'generation',
    stripeCustomerId,
    customerId,
    contractId,
    currencyCode,
    commitAmount: METRONOME_CATALOG.powerUser.annualCommitCredits,
    seatMonthlyAmount: METRONOME_CATALOG.powerUser.seatMonthlyCredits,
    ...(usage
      ? {
          eventsIngested: usage.eventsIngested,
          creditsConsumed: usage.creditsConsumed,
        }
      : {}),
  };
}
