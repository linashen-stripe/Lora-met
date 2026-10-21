import { loadFromStorage } from '@/utils/clientStorage';
import { defaultDemoSettings } from '@/config/config';

export const ADMIN_CREDENTIAL_SOURCE_HEADER = 'x-admin-credential-source';

export type AdminCredentialSource = 'configured' | 'explicit';

export type ExplicitAdminCredentials = {
  metronomeApiKey: string;
  stripeSecretKey: string;
  deliveryMethodId: string;
};

export function buildAdminCredentialHeaders(
  source: AdminCredentialSource,
  explicit: ExplicitAdminCredentials,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    [ADMIN_CREDENTIAL_SOURCE_HEADER]: source,
  };

  if (source === 'explicit') {
    if (explicit.metronomeApiKey.trim()) {
      headers['demo-metronomeapikey'] = explicit.metronomeApiKey.trim();
    }
    if (explicit.stripeSecretKey.trim()) {
      headers['demo-stripesecretkey'] = explicit.stripeSecretKey.trim();
    }
    if (explicit.deliveryMethodId.trim()) {
      headers['demo-metronomedeleivemethodid'] =
        explicit.deliveryMethodId.trim();
    }
    return headers;
  }

  const settings = loadFromStorage(
    'settings',
    defaultDemoSettings,
  ) as Record<string, unknown>;
  if (settings.metronomeApiKey) {
    headers['demo-metronomeapikey'] = String(settings.metronomeApiKey);
  }
  if (settings.stripeSecretKey) {
    headers['demo-stripesecretkey'] = String(settings.stripeSecretKey);
  }
  if (settings.metronomeDeliveryMethodId) {
    headers['demo-metronomedeleivemethodid'] = String(
      settings.metronomeDeliveryMethodId,
    );
  }
  return headers;
}
