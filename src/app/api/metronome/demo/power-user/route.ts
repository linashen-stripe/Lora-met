import { after, NextRequest } from 'next/server';
import { initializeMetronome } from '@/utils/metronome';
import initializeStripe from '@/utils/stripe';
import { withFallbackHeaders } from '@/utils/withFallbackHeaders';
import { createPowerUserDemoCustomer } from '@/utils/demoPowerUser';
import { createGenerationPowerUser } from '@/utils/generationPowerUser';
import { ndjsonStreamResponse } from '@/utils/ndjsonStream';
import {
  DEMO_MODES,
  normalizeDemoMode,
  type DemoMode,
} from '@/config/demoModes';
import { setDemoUsageSeedStatus } from '@/server/demoUsageSeedStatus';
import { ensureAiBuilderUsageProductTags } from '@/server/aiBuilderPackages';
import {
  b2bSeatConsumptionTargets,
  type DemoUsageStory,
} from '@/utils/demoUsageSeedProfiles';
import aiBuilderManifest from '../../../../../../config/metronome/ai-builder-starter.json';
import { METRONOME_CATALOG } from '@/config/metronomeCatalog';
import {
  metronomeContractConsumedUnits,
  pickPrimaryMetronomeContract,
} from '@/utils/metronomeContractPool';

const DEMO_USAGE_AGGREGATION_TIMEOUT_MS = 30_000;
const DEMO_USAGE_AGGREGATION_POLL_MS = 5_000;

async function waitForPowerUserConsumption(
  metronome: NonNullable<ReturnType<typeof initializeMetronome>>,
  customerId: string,
  expectedConsumption: number,
): Promise<void> {
  const deadline = Date.now() + DEMO_USAGE_AGGREGATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) =>
      setTimeout(resolve, DEMO_USAGE_AGGREGATION_POLL_MS),
    );
    const contracts = await metronome.v2.contracts.list({
      customer_id: customerId,
      covering_date: new Date().toISOString(),
      include_balance: true,
    } as any);
    const contract = pickPrimaryMetronomeContract(contracts.data ?? []);
    const consumed = contract
      ? metronomeContractConsumedUnits(contract)
      : null;
    if (
      consumed != null &&
      consumed >= Math.floor(expectedConsumption * 0.98)
    ) {
      return;
    }
  }
  throw new Error(
    'Metronome accepted B2B usage but did not aggregate the expected balance within 30 seconds.',
  );
}

// Creates a fully-wired power user: Stripe customer (with a tax address
// matched to the rate card's currency), a linked Metronome customer, a
// commitment + seat contract, and ~30 days of seeded usage. Used by the
// /admin/customers page and sign-in demo shortcuts. Works against any Metronome
// sandbox (USD, AUD, ...) — the rate card / products are resolved by name,
// and the Stripe address + minor unit scaling follow the rate card's
// currency automatically.
//
// Usage: POST /api/metronome/demo/power-user  { "customerName": "Bufo" }
//
// Streams newline-delimited JSON so the client can render progress live,
// terminal-style, instead of waiting for the whole (multi-step, several
// seconds long) operation to finish:
//   {"type":"log","line":"..."}   — zero or more, in order
//   {"type":"result", ...}        — on success, always last
//   {"type":"error","error":"..."} — on failure, always last

export async function POST(request: NextRequest) {
  const metronome = initializeMetronome(request.headers);
  const stripe = (() => {
    try {
      return initializeStripe(request.headers);
    } catch {
      return null;
    }
  })();

  const body = await request.json().catch(() => ({}));
  const customerName = (body.customerName ?? '').trim();
  const demoMode = normalizeDemoMode(body.demoMode as DemoMode);
  const story = (body.story ?? 'healthy') as DemoUsageStory;
  const { metronomeDeliveryMethodId } = withFallbackHeaders(request.headers);

  return ndjsonStreamResponse(async (onLog) => {
    if (!metronome) throw new Error('Metronome not configured');
    if (!stripe) throw new Error('Stripe not configured');
    if (!customerName) throw new Error('customerName is required');
    if (!['healthy', 'at-risk', 'burst'].includes(story)) {
      throw new Error('Invalid usage story.');
    }

    if (demoMode === 'ai-builder') {
      const tagged = await ensureAiBuilderUsageProductTags(metronome);
      if (tagged > 0) {
        onLog(`Tagged ${tagged} AI Builder usage products.`);
      }
    }

    const deferUsageSeed = (
      customerId: string,
      seedUsage: () => Promise<unknown>,
    ) => {
      setDemoUsageSeedStatus(customerId, 'pending');
      after(async () => {
        try {
          await seedUsage();
          const seatAllocation =
            demoMode === 'generation'
              ? METRONOME_CATALOG.powerUser.seatMonthlyCredits
              : aiBuilderManifest.powerUser.seatMonthlyCreditCents;
          const expectedConsumption = b2bSeatConsumptionTargets(
            seatAllocation,
            story,
          ).reduce((sum, target) => sum + target, 0);
          await waitForPowerUserConsumption(
            metronome,
            customerId,
            expectedConsumption,
          );
          setDemoUsageSeedStatus(customerId, 'completed');
        } catch (error: any) {
          setDemoUsageSeedStatus(
            customerId,
            'failed',
            error?.message ?? 'Demo usage seeding failed',
          );
        }
      });
    };

    const result =
      demoMode === 'generation'
        ? await createGenerationPowerUser({
        metronome,
        stripe,
        customerName,
        story,
        deliveryMethodId: metronomeDeliveryMethodId,
        onLog,
        deferUsageSeed,
          })
        : await createPowerUserDemoCustomer({
            metronome,
            stripe,
            customerName: `[${DEMO_MODES['ai-builder'].label}] ${customerName}`,
            deliveryMethodId: metronomeDeliveryMethodId,
            rateCardName: body.rateCardName,
            commitDollars: body.commitDollars,
            seatMonthlyDollars: body.seatMonthlyDollars,
            story,
            onLog,
            deferUsageSeed,
          });

    return { ...result, demoMode };
  });
}
