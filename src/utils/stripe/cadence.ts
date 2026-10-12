import Stripe from 'stripe';

/**
 * Get an existing active billing cadence for a customer, or create one.
 * Looks for a cadence attached to an active pricing plan subscription first;
 * falls back to creating a new monthly cadence on the given billing profile.
 */
export async function getOrCreateCadence(
  stripe: Stripe,
  customerId: string,
  billingProfileId: string,
): Promise<Stripe.V2.Billing.Cadence> {
  const subscriptions =
    await stripe.v2.billing.pricingPlanSubscriptions.list({
      payer: { type: 'customer', customer: customerId },
      servicing_status: 'active',
    });

  if (subscriptions.data.length > 0) {
    const cadenceId = subscriptions.data[0].billing_cadence;
    return await stripe.v2.billing.cadences.retrieve(cadenceId);
  }

  return await stripe.v2.billing.cadences.create({
    payer: { billing_profile: billingProfileId },
    billing_cycle: { type: 'month', interval_count: 1 },
  });
}
