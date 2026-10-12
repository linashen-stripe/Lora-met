'use client';

import { useConfigContext } from '@/contexts/ConfigContext';
import EmbeddedCheckout from '@/components/checkout/EmbeddedCheckout';
import useEmbeddedPricingPlanCheckout from './useEmbeddedPricingPlanCheckout';
import { LoadingOverlay } from '..';
import ErrorBanner from '../ui/ErrorBanner';

interface SubscribePricingPlanEmbeddedProps {
  isUpgrade?: boolean;
}

const SubscribePricingPlanEmbedded = ({
  isUpgrade: propIsUpgrade,
}: SubscribePricingPlanEmbeddedProps) => {
  const { settings } = useConfigContext();
  const { isLoading, error, checkoutData, handleComplete } =
    useEmbeddedPricingPlanCheckout({
      isUpgrade: propIsUpgrade,
    });

  if (isLoading || !checkoutData) {
    return <LoadingOverlay />;
  }

  if (error) {
    return <ErrorBanner message={error} />;
  }

  if (!settings) {
    return <LoadingOverlay />;
  }

  return (
    <EmbeddedCheckout
      compact
      checkoutData={checkoutData}
      onComplete={handleComplete}
      settings={{
        language: settings.language,
        checkoutMethod: settings.checkoutMethod,
        country: settings.country || 'US',
        currency: settings.currency || 'usd',
        email: settings.email || 'demo@example.com',
        stripePublishableKey: settings.stripePublishableKey || '',
        specialSku: settings.specialSku,
        specialSkuPmc: settings.specialSkuPmc,
      }}
    />
  );
};

export default SubscribePricingPlanEmbedded;
