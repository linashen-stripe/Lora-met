import Stripe from 'stripe';

export const DEFAULT_TEST_BILLING_ADDRESS: Stripe.AddressParam = {
  line1: '354 Oyster Point Blvd',
  city: 'South San Francisco',
  state: 'CA',
  postal_code: '94080',
  country: 'US',
};

type CreateStripeTestCustomerOptions = {
  name: string;
  email: string;
  metadata?: Stripe.MetadataParam;
  address?: Stripe.AddressParam;
  phone?: string;
  paymentMethod?: string;
};

/**
 * Creates a ready-to-invoice Stripe test customer in one request.
 * Reusable test PaymentMethods can only be used with Stripe test keys.
 */
export async function createStripeTestCustomer(
  stripe: Stripe,
  {
    name,
    email,
    metadata,
    address = DEFAULT_TEST_BILLING_ADDRESS,
    phone,
    paymentMethod = 'pm_card_visa',
  }: CreateStripeTestCustomerOptions,
): Promise<string> {
  const customer = await stripe.customers.create({
    name,
    email,
    address,
    shipping: {
      name,
      address,
      ...(phone ? { phone } : {}),
    },
    ...(phone ? { phone } : {}),
    payment_method: paymentMethod,
    invoice_settings: {
      default_payment_method: paymentMethod,
    },
    ...(metadata ? { metadata } : {}),
  });
  return customer.id;
}
