import Stripe from 'stripe';
import { withFallbackHeaders } from './withFallbackHeaders';

export const STRIPE_API_VERSION =
  '2026-01-28.preview' as Stripe.LatestApiVersion;

/** Resolves the secret key from request headers (Tools panel) or STRIPE_SECRET_KEY. */
export function getStripeSecretKey(headerList: Headers): string | undefined {
  const key = headerList
    ? withFallbackHeaders(headerList).stripeSecretKey
    : process.env.STRIPE_SECRET_KEY;
  return key || undefined;
}

const initializeStripe = (
  headerList: Headers,
  options?: Stripe.StripeConfig,
) => {
  const stripeSecretKey = getStripeSecretKey(headerList);

  if (!stripeSecretKey) {
    throw new Error('Stripe secret key is not defined');
  }

  return new Stripe(stripeSecretKey, {
    apiVersion: STRIPE_API_VERSION,
    ...options,
  });
};

export default initializeStripe;
