'use client';

import ErrorBanner from '../ui/ErrorBanner';
import { LoadingOverlay } from '@/components';
import useHostedPricingPlanCheckout from './useHostedPricingPlanCheckout';

const SubscribePricingPlanHostedCheckout = ({
  isUpgrade: propIsUpgrade,
}: {
  isUpgrade?: boolean;
}) => {
  const { isLoading, error } = useHostedPricingPlanCheckout({
    isUpgrade: propIsUpgrade,
  });

  if (isLoading) {
    return <LoadingOverlay />;
  }

  if (error) {
    return <ErrorBanner message={error} />;
  }

  return <div>Redirecting to checkout...</div>;
};

export default SubscribePricingPlanHostedCheckout;
