import { useEffect, useState } from 'react';
import { useConfigContext } from '@/contexts/ConfigContext';
import fetchClient from '@/utils/fetchClient';
import { useElements, useStripe } from '@stripe/react-stripe-js';
import { useRouter } from 'next/navigation';

const useElementsPricingPlanCheckout = ({
  isUpgrade,
}: {
  isUpgrade: boolean;
}) => {
  const router = useRouter();
  const {
    settings,
    customer,
    triggerSubscriptionRefresh,
  } = useConfigContext();
  const stripe = useStripe();
  const elements = useElements();
  const [stripePromise, setStripePromise] = useState<any>(null);
  const [billingIntent, setBillingIntent] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!settings?.currency) {
      return;
    }

    const premiumPlanLookupKey = `llama_ai_premium_plan_${settings.currency}`;

    fetchClient
      .post('/api/stripe/billing-intent/draft/subscribe', {
        pricingPlanLookupKey: premiumPlanLookupKey,
      })
      .then(({ data }) => {
        setBillingIntent(data);
      })
      .catch((e) => {
        console.error('Error creating billing intent:', e);
        setErrorMessage('Could not draft billing intent, please try again.');
      });
  }, [settings?.currency]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements || !customer) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      console.log(
        `Attempting to subscribe customer with billing intent ${billingIntent.id}...`,
      );

      const { error: submitError } = await elements.submit();
      if (submitError) {
        setErrorMessage(submitError.message || 'An error occurred.');
        setIsProcessing(false);
        return;
      }

      const { error, paymentMethod } = await stripe.createPaymentMethod({
        elements,
      });

      if (error) {
        setErrorMessage(error.message || 'Failed to create payment method.');
        setIsProcessing(false);
        return;
      }

      console.log('Generated Payment Method ID:', paymentMethod.id);

      if (!billingIntent || billingIntent.status !== 'draft') {
        setErrorMessage('Billing intent is not in draft status.');
        setIsProcessing(false);
        return;
      }

      await fetchClient.post(`/api/stripe/billing-intent/complete`, {
        billingIntentId: billingIntent.id,
        paymentMethodId: paymentMethod.id,
      });

      // The billing intent atomically handles both deactivation (if upgrading)
      // and subscription, so no separate cancel call is needed.
      await triggerSubscriptionRefresh();

      if (isUpgrade) {
        router.push(`/${settings?.language}/dashboard`);
      } else {
        router.push(`/${settings?.language}/chat`);
      }
    } catch (error: any) {
      setErrorMessage(error.message || 'An unexpected error occurred.');
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    stripePromise,
    billingIntent,
    errorMessage,
    handleSubmit,
    isProcessing,
  };
};

export default useElementsPricingPlanCheckout;
