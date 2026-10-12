'use client';

import axios from 'axios';
import { loadFromStorage } from './clientStorage';
import { defaultDemoSettings } from '@/config/config';

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
  const { id, stripeCustomerId } = loadFromStorage('customer', {}) as {
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

  return config;
});

export default fetchClient;
