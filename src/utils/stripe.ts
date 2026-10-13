import Stripe from 'stripe';
import { withFallbackHeaders } from './withFallbackHeaders';
import {
  API_INSPECTOR_SESSION_HEADER,
  API_INSPECTOR_TRACE_HEADER,
  createTraceId,
} from '@/utils/apiInspector';
import { publishApiTrace } from '@/utils/apiInspectorServer';

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

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: STRIPE_API_VERSION,
    ...options,
  });
  const sessionId = headerList.get(API_INSPECTOR_SESSION_HEADER);
  const parentId = headerList.get(API_INSPECTOR_TRACE_HEADER) ?? undefined;
  if (sessionId) {
    stripe.on('response', (event) => {
      publishApiTrace(sessionId, {
        id: createTraceId('stripe'),
        parentId,
        source: 'stripe',
        method: String(event.method ?? 'GET').toUpperCase(),
        url: `https://api.stripe.com${event.path ?? ''}`,
        startedAt: new Date(
          Number(event.request_start_time ?? Date.now()),
        ).toISOString(),
        durationMs: Number(event.elapsed ?? 0),
        status: Number(event.status ?? 0),
        state:
          Number(event.status ?? 0) >= 400 ? 'error' : 'success',
        response: {
          requestId: event.request_id,
          apiVersion: event.api_version,
        },
      });
    });
  }
  return stripe;
};

export default initializeStripe;
