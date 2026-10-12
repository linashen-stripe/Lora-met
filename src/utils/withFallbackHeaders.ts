import { defaultDemoSettings } from '@/config/config';

export const withFallbackHeaders = (headerList: Headers) => {
  const headers = {
    stripeSecretKey:
      headerList.get('demo-stripesecretkey') ||
      process.env.STRIPE_SECRET_KEY ||
      undefined,
    stripePublishableKey:
      headerList.get('demo-stripepublishablekey') || undefined,
    metronomeApiKey:
      headerList.get('demo-metronomeapikey') ||
      process.env.METRONOME_API_KEY ||
      undefined,
    metronomeDeliveryMethodId:
      headerList.get('demo-metronomedeleivemethodid') ||
      process.env.METRONOME_DELIVERY_METHOD_ID ||
      undefined,
    currency: headerList.get('demo-currency') || undefined,
    language: headerList.get('demo-language') || undefined,
    email: headerList.get('demo-email') || undefined,
    /** App “customer” id (often Metronome UUID after sign-up). Not always a Stripe id. */
    customer: headerList.get('demo-customer') || undefined,
    /** Stripe Customer id (`cus_…`) when linked; prefer for Stripe API calls. */
    stripeCustomerId: headerList.get('demo-stripe-customer')?.trim() || undefined,
  };

  return {
    ...defaultDemoSettings,
    ...headers,
  };
};

/**
 * Stripe Checkout / Billing APIs require a Stripe customer id (`cus_…`).
 * `demo-customer` may hold the Metronome customer id instead.
 */
export function getStripeCustomerId(headerList: Headers): string | undefined {
  const fromStripeHeader = headerList.get('demo-stripe-customer')?.trim();
  if (fromStripeHeader) return fromStripeHeader;
  const legacy = headerList.get('demo-customer')?.trim();
  if (legacy?.startsWith('cus_')) return legacy;
  return undefined;
}
