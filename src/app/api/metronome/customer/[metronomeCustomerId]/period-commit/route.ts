import { NextRequest, NextResponse } from 'next/server';
import { initializeMetronome } from '@/utils/metronome';
import { pickPrimaryMetronomeContract } from '@/utils/metronomeContractPool';
import { withFallbackHeaders } from '@/utils/withFallbackHeaders';
import initializeStripe from '@/utils/stripe';
import { finalizeAndPayMetronomeInvoice } from '@/utils/stripeInvoiceFinalize';

/**
 * POST — add a fresh PREPAID commit starting today for the current billing period.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ metronomeCustomerId: string }> },
) {
  try {
    const { metronomeCustomerId } = await params;
    const metronome = initializeMetronome(request.headers);
    if (!metronome) {
      return NextResponse.json({ error: 'Metronome not configured' }, { status: 503 });
    }

    const contractsRes = await metronome.v2.contracts.list({
      customer_id: metronomeCustomerId,
      include_balance: false,
    } as any);
    const contract = pickPrimaryMetronomeContract(contractsRes.data ?? []);
    if (!contract) {
      return NextResponse.json({ error: 'No active contract found' }, { status: 404 });
    }

    const existingCommit =
      (contract.commits ?? [])[0] ?? (contract.credits ?? [])[0];
    if (!existingCommit) {
      return NextResponse.json({ error: 'No commit found on contract' }, { status: 404 });
    }

    const productId: string | undefined =
      existingCommit.product?.id ?? (existingCommit as any).product_id;
    const commitAmount: number | undefined =
      (existingCommit.access_schedule?.schedule_items ?? [])[0]?.amount;

    if (!productId || !commitAmount) {
      return NextResponse.json({ error: 'Could not resolve product or amount' }, { status: 500 });
    }

    // Period starts today — the contract was backdated exactly 1 month so today
    // is the natural start of billing period 2 (first period is already finalized).
    const now = new Date();
    const periodStart = new Date(now);
    periodStart.setHours(0, 0, 0, 0);
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    const createdAfter = Math.floor(Date.now() / 1000) - 15;

    // Use the current timestamp (not midnight) for the invoice_schedule so Metronome
    // triggers the Stripe invoice immediately. If we used periodStart (midnight UTC)
    // and provisioning runs during the day, Metronome would queue the invoice for
    // midnight and the Stripe finalization poll would never find it in time.
    const invoiceNow = new Date();

    await (metronome.v2.contracts as any).edit({
      customer_id: metronomeCustomerId,
      contract_id: contract.id,
      add_commits: [{
        type: 'PREPAID',
        product_id: productId,
        name: 'Monthly Credit - Current Period',
        access_schedule: {
          schedule_items: [{
            amount: commitAmount,
            starting_at: periodStart.toISOString(),
            ending_before: periodEnd.toISOString(),
          }],
        },
        invoice_schedule: {
          schedule_items: [{
            timestamp: invoiceNow.toISOString(),
            amount: commitAmount,
          }],
        },
      }],
    });

    console.log(`[period-commit] Added $${(commitAmount / 100).toFixed(2)} commit for ${metronomeCustomerId}`);

    const { stripeCustomerId } = withFallbackHeaders(request.headers);
    if (stripeCustomerId) {
      try {
        const stripe = initializeStripe(request.headers);
        finalizeAndPayMetronomeInvoice(stripe, stripeCustomerId, createdAfter, 'period-commit').catch(
          (err) => console.error('[period-commit] Invoice payment failed:', err),
        );
      } catch {
        // Stripe not configured — skip
      }
    }

    return NextResponse.json({ ok: true, amountCents: commitAmount, createdAfter });
  } catch (err: any) {
    console.error('[period-commit] Error:', err?.message);
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 });
  }
}
