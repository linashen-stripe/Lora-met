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

// Balance and draft-invoice aggregation complete independently. Six seconds
// can expose the updated balance while the dashboard still has the earlier
// subscription-only draft cached, so wait long enough for the automatic
// post-seed refresh to include usage and applied-credit lines.
const DEMO_USAGE_AGGREGATION_GRACE_MS = 10_000;

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
  const { metronomeDeliveryMethodId } = withFallbackHeaders(request.headers);

  return ndjsonStreamResponse(async (onLog) => {
    if (!metronome) throw new Error('Metronome not configured');
    if (!stripe) throw new Error('Stripe not configured');
    if (!customerName) throw new Error('customerName is required');

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
          await new Promise((resolve) =>
            setTimeout(resolve, DEMO_USAGE_AGGREGATION_GRACE_MS),
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
            onLog,
            deferUsageSeed,
          });

    return { ...result, demoMode };
  });
}
