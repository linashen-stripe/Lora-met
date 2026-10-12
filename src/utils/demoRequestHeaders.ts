import { loadFromStorage } from '@/utils/clientStorage';
import { defaultDemoSettings } from '@/config/config';

/** Client-side headers for admin/demo API calls, mirroring fetchClient's interceptor. */
export function buildDemoRequestHeaders(): Record<string, string> {
  const settings = loadFromStorage('settings', defaultDemoSettings) as Record<string, unknown>;
  const customer = loadFromStorage('customer', {}) as {
    id?: string;
    stripeCustomerId?: string;
  };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (settings.stripeSecretKey) headers['demo-stripesecretkey'] = String(settings.stripeSecretKey);
  if (settings.metronomeApiKey) headers['demo-metronomeapikey'] = String(settings.metronomeApiKey);
  if (settings.metronomeDeliveryMethodId) {
    headers['demo-metronomedeleivemethodid'] = String(settings.metronomeDeliveryMethodId);
  }
  if (customer.id) headers['demo-customer'] = customer.id;
  if (customer.stripeCustomerId) headers['demo-stripe-customer'] = customer.stripeCustomerId;
  return headers;
}
