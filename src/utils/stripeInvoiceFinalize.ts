import initializeStripe from '@/utils/stripe';

/**
 * Background job: poll Stripe for Metronome-created invoices, finalize them,
 * and charge the customer immediately.
 *
 * Processes ALL matching invoices — when two invoices land at the same Stripe
 * timestamp, .find() would miss the second one.
 *
 * One invoice's error never blocks the others — each is caught individually
 * and the loop retries on the next poll cycle.
 *
 * @param stripe       Initialized Stripe client
 * @param customerId   Stripe customer ID
 * @param createdAfter Unix timestamp (seconds); only invoices created after this are candidates
 * @param label        Log prefix for tracing (e.g. 'credit-grant', 'upgrade')
 */
export async function finalizeAndPayMetronomeInvoice(
  stripe: ReturnType<typeof initializeStripe>,
  customerId: string,
  createdAfter: number,
  label = 'invoice',
): Promise<void> {
  for (let attempt = 0; attempt < 150; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));

    const [draftRes, openRes] = await Promise.all([
      stripe.invoices.list({ customer: customerId, status: 'draft', limit: 10 }),
      stripe.invoices.list({ customer: customerId, status: 'open', limit: 10 }),
    ]);

    const candidates = [...draftRes.data, ...openRes.data].filter(
      (inv) => inv.created >= createdAfter,
    );

    if (candidates.length === 0) continue;

    let allSettled = true;
    for (const target of candidates) {
      try {
        if (target.status === 'draft') {
          await stripe.invoices.finalizeInvoice(target.id);
        }
        await stripe.invoices.pay(target.id, { off_session: true });
        console.log(`[${label}] ✅ Invoice paid: ${target.id}`);
      } catch (err: any) {
        const msg: string = err?.message ?? '';
        const code: string = err?.code ?? '';
        if (
          msg.includes('already paid') ||
          msg.includes('Invoice is paid') ||
          code === 'invoice_payment_intent_requires_action'
        ) {
          // Already settled or requires 3DS — treat as done.
          console.log(`[${label}] ✅ Invoice already handled: ${target.id}`);
        } else if (
          code === 'invoice_not_editable' ||
          msg.includes('already finalized') ||
          msg.includes('cannot be finalized') ||
          msg.includes('not editable')
        ) {
          // Finalize raced with Stripe auto-advance — invoice is open, retry pay next cycle.
          console.warn(`[${label}] ⚠️ Finalize race on ${target.id}, will retry`);
          allSettled = false;
        } else {
          // Unexpected error — log and continue; don't let one invoice block others.
          console.error(`[${label}] ⚠️ Could not settle invoice ${target.id}: ${msg}`);
          allSettled = false;
        }
      }
    }

    if (allSettled) return;
  }
  console.warn(`[${label}] ⚠️ Invoices not settled within timeout`);
}
