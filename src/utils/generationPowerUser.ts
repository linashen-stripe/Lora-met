import Metronome from '@metronome/sdk';
import Stripe from 'stripe';
import { DEMO_MODES } from '@/config/demoModes';
import {
  createStripeCustomerForDemo,
  resolveRateCardByName,
} from '@/utils/demoPowerUser';
import {
  attachStripeBillingProviderToContract,
  createContract,
  createMetronomeCustomer,
  listPackages,
  resolveMetronomeDeliveryMethodIdAsync,
} from '@/utils/metronome';
import { pickMetronomePackageForTier } from '@/utils/metronomePackageResolve';
import { seedGenerationUsage } from '@/utils/metronomeGenerationSeedUsage';

const GENERATION_RATE_CARD_NAME = 'Lora Generate - Standard Rate Card';
const GENERATION_HISTORY_DAYS = 27;

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
  eventsIngested: number;
  creditsConsumed: number;
}

/**
 * Creates the Generation equivalent of the AI Builder power user: linked
 * Stripe/Metronome customers, an Enterprise package contract, and a
 * deterministic multi-user, multi-project usage history.
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

  onLog('[1/5] Resolving the Generation Enterprise package...');
  const packages = await listPackages(metronome);
  const enterprisePackage = pickMetronomePackageForTier(
    packages,
    'enterprise',
    'generation',
  );
  if (!enterprisePackage) {
    throw new Error(
      'Lora Generate Enterprise package was not found. Seed the Generation catalog first.',
    );
  }
  const { currencyCode } = await resolveRateCardByName(
    metronome,
    GENERATION_RATE_CARD_NAME,
  );
  onLog(`    ✓ package → ${enterprisePackage.name} (${enterprisePackage.id})`);

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

  // Keep enough history for a representative graph while ensuring the
  // one-month Enterprise package is still active when the demo is opened.
  const startingAt = new Date(
    Date.now() - GENERATION_HISTORY_DAYS * 24 * 60 * 60 * 1000,
  );
  startingAt.setUTCMinutes(0, 0, 0);

  onLog('\n[4/5] Creating the Generation Enterprise contract...');
  const contractId = await createContract(metronome, {
    metronomeCustomerId: customerId,
    packageId: enterprisePackage.id,
    startingAt: startingAt.toISOString(),
    uniquenessKey: `generation-power-user:${customerId}`,
    preferredDeliveryMethodId: deliveryMethodId,
  });
  try {
    await attachStripeBillingProviderToContract(
      metronome,
      customerId,
      contractId,
      deliveryMethodId,
    );
  } catch (error) {
    onLog(
      `    ⚠ contract created, but its explicit Stripe billing link could not be saved: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
  }
  onLog(`    ✓ contract → ${contractId}`);

  onLog('\n[5/5] Seeding Generation usage by user and project...');
  const usage = await seedGenerationUsage({
    metronome,
    customerId,
    story: 'healthy',
    lookbackDays: GENERATION_HISTORY_DAYS - 1,
    trailingUnseededDays: 1,
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
    eventsIngested: usage.eventsIngested,
    creditsConsumed: usage.creditsConsumed,
  };
}
