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
    const requestSender = (stripe as any)._requestSender;
    const originalRequest = requestSender._request.bind(requestSender);
    requestSender._request = (
      method: string,
      host: string,
      path: string,
      data: unknown,
      authenticator: unknown,
      requestOptions: { streaming?: boolean },
      usage: unknown,
      callback: (error: unknown, response: unknown) => void,
      requestDataProcessor: unknown,
    ) => {
      const id = createTraceId('stripe');
      const startedAt = new Date();
      const tracedCallback = (error: any, response: any) => {
        const status = Number(
          response?.lastResponse?.statusCode ?? error?.statusCode ?? 0,
        );
        publishApiTrace(sessionId, {
          id,
          parentId,
          source: 'stripe',
          method: String(method).toUpperCase(),
          url: `https://${host || 'api.stripe.com'}${path}`,
          startedAt: startedAt.toISOString(),
          durationMs: Date.now() - startedAt.getTime(),
          status: status || undefined,
          state: error ? 'error' : 'success',
          request: data,
          response: requestOptions?.streaming
            ? '[streaming response]'
            : response,
          error: error ? String(error.message ?? error) : undefined,
          stream: Boolean(requestOptions?.streaming),
        });
        callback(error, response);
      };

      return originalRequest(
        method,
        host,
        path,
        data,
        authenticator,
        requestOptions,
        usage,
        tracedCallback,
        requestDataProcessor,
      );
    };
  }
  return stripe;
};

export default initializeStripe;
