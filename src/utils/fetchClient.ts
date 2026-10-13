'use client';

import axios from 'axios';
import { loadFromStorage } from './clientStorage';
import { defaultDemoSettings } from '@/config/config';
import {
  customerStorageKey,
  normalizeDemoMode,
} from '@/config/demoModes';
import {
  API_INSPECTOR_SESSION_HEADER,
  API_INSPECTOR_TRACE_HEADER,
  createTraceId,
  emitClientApiTrace,
  getApiInspectorSessionId,
  safeJsonParse,
  sanitizeApiValue,
} from '@/utils/apiInspector';

const APP_ORIGIN_HEADER = 'x-app-origin';

const defaultOptions = {
  method: 'get',
  headers: {
    'Content-Type': 'application/json',
  },
};
const fetchClient = axios.create(defaultOptions);

fetchClient.interceptors.request.use(function (config) {
  const {
    stripeSecretKey,
    stripePublishableKey,
    metronomeApiKey,
    metronomeDeliveryMethodId,
    currency,
    language,
  } = loadFromStorage('settings', defaultDemoSettings);
  const demoMode = normalizeDemoMode(
    loadFromStorage('demoMode', 'generation'),
  );
  const legacyCustomer = loadFromStorage('customer', {});
  const { id, stripeCustomerId } = loadFromStorage(
    customerStorageKey(demoMode),
    legacyCustomer,
  ) as {
    id?: string;
    stripeCustomerId?: string;
  };

  config.headers['demo-stripesecretkey'] = stripeSecretKey;
  config.headers['demo-stripepublishablekey'] = stripePublishableKey;
  config.headers['demo-metronomeapikey'] = metronomeApiKey;
  if (metronomeDeliveryMethodId) {
    config.headers['demo-metronomedeleivemethodid'] = metronomeDeliveryMethodId;
  }
  config.headers['demo-currency'] = currency;
  config.headers['demo-customer'] = id;
  if (stripeCustomerId) {
    config.headers['demo-stripe-customer'] = stripeCustomerId;
  }
  config.headers['demo-language'] = language;

  // Lets API routes build Stripe redirect URLs to this tab’s origin (localhost:3000, etc.)
  // even when proxies set X-Forwarded-Host to another host.
  if (typeof window !== 'undefined') {
    config.headers[APP_ORIGIN_HEADER] = window.location.origin;
  }

  const inspectorSessionId = getApiInspectorSessionId();
  if (inspectorSessionId) {
    const traceId = createTraceId('app');
    config.headers[API_INSPECTOR_SESSION_HEADER] = inspectorSessionId;
    config.headers[API_INSPECTOR_TRACE_HEADER] = traceId;
    (config as any).__apiInspector = {
      id: traceId,
      startedAtMs: performance.now(),
      startedAt: new Date().toISOString(),
    };
    emitClientApiTrace({
      id: traceId,
      source: 'app',
      method: String(config.method ?? 'GET').toUpperCase(),
      url: String(config.url ?? ''),
      startedAt: new Date().toISOString(),
      state: 'pending',
      request: sanitizeApiValue(safeJsonParse(config.data)),
    });
  }

  return config;
});

fetchClient.interceptors.response.use(
  (response) => {
    const trace = (response.config as any).__apiInspector;
    if (trace) {
      emitClientApiTrace({
        id: trace.id,
        source: 'app',
        method: String(response.config.method ?? 'GET').toUpperCase(),
        url: String(response.config.url ?? ''),
        startedAt: trace.startedAt,
        durationMs: Math.round(performance.now() - trace.startedAtMs),
        status: response.status,
        state: 'success',
        request: sanitizeApiValue(safeJsonParse(response.config.data)),
        response: sanitizeApiValue(response.data),
      });
    }
    return response;
  },
  (error) => {
    const config = error?.config;
    const trace = config?.__apiInspector;
    if (trace) {
      emitClientApiTrace({
        id: trace.id,
        source: 'app',
        method: String(config.method ?? 'GET').toUpperCase(),
        url: String(config.url ?? ''),
        startedAt: trace.startedAt,
        durationMs: Math.round(performance.now() - trace.startedAtMs),
        status: error?.response?.status,
        state: 'error',
        request: sanitizeApiValue(safeJsonParse(config.data)),
        response: sanitizeApiValue(error?.response?.data),
        error: String(error?.message ?? 'Request failed'),
      });
    }
    return Promise.reject(error);
  },
);

export default fetchClient;
