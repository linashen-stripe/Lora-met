import { useConfigContext } from '@/contexts/ConfigContext';
import fetchClient from '@/utils/fetchClient';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import Stripe from 'stripe';
import { DEMO_MODES } from '@/config/demoModes';

// Save payment method to customer
const savePaymentMethod = async (
  customerId: string | undefined,
  intent: string | null,
) => {
  if (!customerId || !intent) {
    throw new Error('Missing required parameters for saving payment method');
  }

  try {
    await fetchClient.post('/api/stripe/payment-method', {
      customerId,
      intent,
    });
  } catch (error) {
    console.error('Error saving payment method: ', error);
  }
};

const useEmbeddedPricingPlanCheckout = ({
  isUpgrade: propIsUpgrade,
}: {
  isUpgrade?: boolean;
}) => {
  const router = useRouter();
  const {
    settings,
    customer,
    demoMode,
    subscription: currentSubscription,
    triggerSubscriptionRefresh,
  } = useConfigContext();
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkoutData, setCheckoutData] = useState<{
    clientSecret: string;
    sessionId: string;
  } | null>(null);

  const searchParams = useSearchParams();
  const isUpgrade = propIsUpgrade || searchParams.get('upgrade') === 'true';

  useEffect(() => {
    if (!settings) {
      setError(
        'Could not create embedded checkout session, you may not be signed in.',
      );
      return;
    }

    // Create a checkout session for the pricing plan
    fetchClient
      .post('/api/stripe/checkout-session', {
        uiMode: 'embedded',
        settings: {
          language: settings.language,
          currency: settings.currency,
        },
        pricingPlanLookupKey: `llama_ai_premium_plan_${
          settings?.currency || 'usd'
        }`,
      })
      .then(({ data }) => {
        // Save checkout session data to enable embedded checkout
        setCheckoutData(data);
      })
      .catch((e) => {
        setError(
          'Could not create embedded checkout session, please try again.',
        );
      });
  }, [settings]);

  // Handles the post processing of the completed checkout session
  const handleComplete = useCallback(async () => {
    if (!checkoutData?.sessionId || !customer?.id) {
      setError('Could not complete checkout session, please try again.');
      return;
    }

    setIsProcessing(true);
    try {
      const { data: sessionData } =
        await fetchClient.get<Stripe.Checkout.Session>(
          `/api/stripe/checkout-session/${checkoutData.sessionId}`,
        );

      if (sessionData.status !== 'complete') {
        console.log(
          `Warning: checkout-session not completed, status: ${sessionData.status}`,
        );
        setError('Checkout session not completed, please try again.');
        return;
      }

      const intent = sessionData.setup_intent || sessionData.payment_intent;
      if (!customer.stripeCustomerId) {
        setError('Missing Stripe customer — sign in again or check account setup.');
        return;
      }
      await savePaymentMethod(customer.stripeCustomerId, intent as string);

      if (isUpgrade && currentSubscription) {
        await fetchClient.post('/api/stripe/pricing-plan-subscription/cancel', {
          customerId: customer.stripeCustomerId,
          pricingPlanSubscriptionId: currentSubscription.id,
          billingCadenceId: currentSubscription.billingCadenceId,
          enableAutomaticReenrollment: false,
        });

        await triggerSubscriptionRefresh();
      }
      router.push(
        `/${settings?.language || 'en'}${DEMO_MODES[demoMode].route}`,
      );
    } finally {
      setIsProcessing(false);
    }
  }, [
    checkoutData,
    customer,
    demoMode,
    isUpgrade,
    currentSubscription,
    settings,
    router,
    triggerSubscriptionRefresh,
  ]);

  // While promises are pending, indicate we are loading
  const isLoading = !checkoutData;

  return { isLoading, isProcessing, error, checkoutData, handleComplete };
};

export default useEmbeddedPricingPlanCheckout;
