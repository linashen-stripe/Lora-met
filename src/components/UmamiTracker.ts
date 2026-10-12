'use client';

import { useEffect } from 'react';
import { useConfigContext } from '@/contexts/ConfigContext';
import { debounceTrack } from '@/utils/tracking';

interface TrackingData {
  checkoutMethod_value: string;
  currency_value: string;
  language_value: string;
  primaryColor_value: string;
  backgroundColor_value: string;
  elementsStyle_value: string;
  stripe_keys_value: 'default' | 'custom';
  customLogo_value?: string;
  externalPaymentMethod_value?: string;
}

export default function UmamiTracker(): null {
  const { settings } = useConfigContext();

  // Settings tracking
  useEffect(() => {
    const trackingData: TrackingData = {
      checkoutMethod_value: settings?.checkoutMethod,
      currency_value: settings?.currency,
      language_value: settings?.language ?? 'en',
      primaryColor_value: settings?.primaryColor,
      backgroundColor_value: settings?.backgroundColor,
      elementsStyle_value: settings?.elementsStyle,
      stripe_keys_value: settings?.stripePublishableKey?.startsWith(
        'pk_test_51Q8PM',
      )
        ? 'default'
        : 'custom',
    };

    if (settings?.customLogo) {
      trackingData.customLogo_value = settings.customLogo;
    }
    if (settings?.externalPaymentMethod) {
      trackingData.externalPaymentMethod_value = settings.externalPaymentMethod;
    }

    debounceTrack('page_state', trackingData);
  }, [settings]);

  return null;
}
