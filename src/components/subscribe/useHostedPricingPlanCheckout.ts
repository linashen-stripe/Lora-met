import { useConfigContext } from '@/contexts/ConfigContext';
import fetchClient from '@/utils/fetchClient';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';

const useHostedPricingPlanCheckout = ({
  isUpgrade: propIsUpgrade,
}: {
  isUpgrade?: boolean;
}) => {
  const router = useRouter();
  const { settings, subscription: currentSubscription } = useConfigContext();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const isUpgrade = propIsUpgrade || searchParams.get('upgrade') === 'true';

  useEffect(() => {
    if (!settings) {
      setError(
        'Could not create embedded checkout session, you may not be signed in.',
      );
      return;
    }

    // Create a checkout session for the pricing plan and redirect
    fetchClient
      .post('/api/stripe/checkout-session', {
        uiMode: 'hosted',
        settings: {
          language: settings.language,
          currency: settings.currency,
        },
        pricingPlanLookupKey: `llama_ai_premium_plan_${
          settings?.currency || 'usd'
        }`,
        successUrl: `${window.location.origin}/${settings.language}/return?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${window.location.origin}/${settings.language}/pricing`,
        // Stripe metadata values must be strings — return page checks isUpgrade === 'true'
        ...(isUpgrade &&
        currentSubscription?.id &&
        currentSubscription?.billingCadenceId
          ? {
              metadata: {
                isUpgrade: 'true',
                currentSubscriptionId: String(currentSubscription.id),
                billingCadenceId: String(currentSubscription.billingCadenceId),
              },
            }
          : {}),
      })
      .then(({ data }) => {
        // Redirect to the checkout page
        router.push(data.url);
      })
      .catch((e) => {
        setIsLoading(false);
        setError(
          'Could not create embedded checkout session, please try again.',
        );
        console.error(e);
      });
  }, [settings]);

  return { isLoading, error };
};

export default useHostedPricingPlanCheckout;
