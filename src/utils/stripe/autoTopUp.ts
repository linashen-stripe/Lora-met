import Stripe from 'stripe';
import initializeStripe from '@/utils/stripe';

const stripe = initializeStripe(new Headers());

/**
 * Charges the customer for a Metronome auto top-up by creating and immediately
 * paying a Stripe invoice. Does NOT create Stripe credit grants — credits are
 * tracked in Metronome.
 */
export async function chargeMetronomeTopUp(
  stripeCustomerId: string,
  amountCents: number,
  currency: string = 'usd',
): Promise<void> {
  await stripe.invoiceItems.create({
    customer: stripeCustomerId,
    amount: amountCents,
    currency: currency.toLowerCase(),
    description: 'Credit Auto Top-Up',
  });

  const invoice = await stripe.invoices.create({
    customer: stripeCustomerId,
    collection_method: 'charge_automatically',
    pending_invoice_items_behavior: 'include',
    description: 'Credit Auto Top-Up',
    automatic_tax: { enabled: true },
  });

  const finalized = await stripe.invoices.finalizeInvoice(invoice.id!);
  const paid = await stripe.invoices.pay(finalized.id!, { expand: ['payment_intent'] });

  if (paid.status !== 'paid') {
    throw new Error(`Invoice ${paid.id} payment failed with status: ${paid.status}`);
  }

  console.log(`[autoTopUp] Stripe invoice ${paid.id} paid for $${amountCents / 100}`);
}

export async function performAutoTopUp(
  customerId: string,
  topUpAmount: number,
  currency: string = 'usd',
) {
  try {
    const invoiceItemParams: Stripe.InvoiceItemCreateParams = {
      customer: customerId,
      amount: topUpAmount,
      currency: currency.toLowerCase(),
      description: 'Credit Auto Top-Up',
    };
    await stripe.invoiceItems.create(invoiceItemParams);

    const invoiceCreateParams: Stripe.InvoiceCreateParams = {
      customer: customerId,
      collection_method: 'charge_automatically',
      pending_invoice_items_behavior: 'include',
      description: 'Credit Auto Top-Up',
      automatic_tax: { enabled: true },
    };
    const invoice = await stripe.invoices.create(invoiceCreateParams);

    // 3) Finalize and attempt to pay the invoice immediately
    if (!invoice?.id) {
      throw new Error('Created invoice has no ID');
    }
    const invoiceId = invoice.id;
    const finalized = await stripe.invoices.finalizeInvoice(invoiceId);
    if (!finalized?.id) {
      throw new Error('Finalized invoice has no ID');
    }
    const finalizedId = finalized.id as string;
    const paidInvoice = await stripe.invoices.pay(finalizedId, {
      expand: ['payment_intent'],
    });

    console.log(`Invoice ${paidInvoice.id} created and payment attempted.`);

    // 4) Grant credits immediately if the payment was successful.
    if (paidInvoice.status === 'paid') {
      const creditGrant = await stripe.billing.creditGrants.create({
        name: 'Auto Top-Up Credits',
        customer: customerId,
        amount: {
          monetary: {
            currency: currency.toLowerCase(),
            value: topUpAmount,
          },
          type: 'monetary',
        },
        applicability_config: {
          scope: {
            price_type: 'metered',
          },
        },
        category: 'paid',
        priority: 55, // Medium priority: after welcome credits (40), before manual credits (60)
      });
      console.log(
        `Credits granted: ${creditGrant.id} for successful invoice ${paidInvoice.id}`,
      );
    } else {
      console.error(
        `Invoice payment failed for invoice ${paidInvoice.id}. Status: ${paidInvoice.status}`,
      );
    }
  } catch (error) {
    console.error('Auto top-up failed:', error);
  }
}
