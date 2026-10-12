import Stripe from 'stripe';

/**
 * Get an existing active billing profile for a customer, or create one.
 */
export async function getOrCreateBillingProfile(
  stripe: Stripe,
  customerId: string,
): Promise<Stripe.V2.Billing.Profile> {
  const existing = await stripe.v2.billing.profiles.list({
    customer: customerId,
    status: 'active',
  } as Stripe.V2.Billing.ProfileListParams);

  if (existing.data.length > 0) {
    return existing.data[0];
  }

  return await stripe.v2.billing.profiles.create({
    customer: customerId,
  });
}
