'use client';

import { useState, useMemo, useCallback } from 'react';
import { Elements } from '@stripe/react-stripe-js';
import {
  loadStripe,
  StripeElementsOptions,
  Stripe,
  StripeElements,
  StripeElementLocale,
  Appearance,
} from '@stripe/stripe-js';
import { useConfigContext } from '@/contexts/ConfigContext';
import { CheckoutProvider } from '@/contexts/CheckoutContext';
import fetchClient from '@/utils/fetchClient';
import appearance from '../config/Appearance';
import { useCart } from '@/contexts/CartContext';
import { useRouter } from 'next/navigation';
import ElementsCheckoutForm from '../elements/ElementsCheckoutForm';
import { getStripeLocale } from '@/utils/stripe/localeUtils';

export default function ElementsCheckout() {
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const { settings, customer } = useConfigContext();
  const { items, clearCart, calculateTotal } = useCart();
  console.log('items in the elements checkout with payment intents', items);
  const stripePromise = useMemo(() => {
    if (!settings?.stripePublishableKey) return null;

    return loadStripe(settings.stripePublishableKey, {
      locale: getStripeLocale(settings?.language || 'en'),
    }).catch(() => null);
  }, [settings?.stripePublishableKey, settings?.language]);

  const options: StripeElementsOptions = useMemo(() => {
    return {
      mode: 'subscription' as const,
      amount: calculateTotal(),
      currency: settings?.currency,
      fonts: [{ cssSrc: 'https://fonts.googleapis.com/css?family=Aleo' }],
      appearance: appearance as Appearance,
      locale: (settings?.language || 'en') as StripeElementLocale,
      paymentMethodCreation: 'manual' as const,
      defaultValues: {
        billingDetails: {
          email: customer?.email,
        },
      },
      externalPaymentMethodTypes:
        settings?.externalPaymentMethod &&
        settings?.externalPaymentMethod.length > 0
          ? [settings?.externalPaymentMethod]
          : undefined,
    };
  }, [
    calculateTotal,
    settings?.currency,
    settings?.language,
    settings?.externalPaymentMethod,
    customer?.email,
  ]);

  const createSubscription = useCallback(
    async (paymentMethod: string) => {
      // Legacy subscription API removed - this component is no longer used
      throw new Error(
        'Legacy subscription API is no longer available. Please use pricing plan subscriptions.',
      );
    },
    [customer?.id, items],
  );

  // Create subscription
  const handleSubmit = useCallback(
    async (stripe: Stripe | null, elements: StripeElements | null) => {
      if (!stripe || !elements || !settings) return;

      setIsProcessing(true);

      try {
        // Handle external payment methods for standard subscriptions
        if (paymentMethod?.startsWith('external')) {
          await createSubscription(paymentMethod);
          router.push(
            `/${settings.language}/return?method=elements&setup_intent=${paymentMethod}&redirect_status=succeeded`,
          );
          return;
        }

        const { error: submitError } = await elements.submit();
        if (submitError) {
          setMessage(
            submitError.message ?? 'An error occurred during submission.',
          );
          setIsProcessing(false);
          return;
        }

        const { error: pmError, paymentMethod: newPaymentMethod } =
          await stripe.createPaymentMethod({
            elements,
          });

        if (pmError) {
          throw new Error(
            pmError.message ?? 'Failed to create payment method.',
          );
        }

        if (!newPaymentMethod) {
          throw new Error('Failed to create payment method.');
        }

        // Standard Subscription Flow: create sub, get secret, confirm on client.
        const { clientSecret, type } = await createSubscription(
          newPaymentMethod.id,
        );

        if (!clientSecret) {
          throw new Error('Could not initialize payment. Please try again.');
        }

        const confirmIntent =
          type === 'setup' ? stripe.confirmSetup : stripe.confirmPayment;

        const { error } = await confirmIntent({
          elements,
          clientSecret,
          confirmParams: {
            return_url: `${window.location.origin}/${settings.language}/return?method=elements`,
          },
        });

        if (error) {
          throw new Error(
            error.message ?? 'An error occurred during payment confirmation.',
          );
        }
      } catch (err: any) {
        setMessage(err.message || 'An unexpected error occurred.');
      } finally {
        setIsProcessing(false);
      }
    },
    [settings, paymentMethod, router, createSubscription],
  );

  return (
    <Elements stripe={stripePromise} options={options}>
      <CheckoutProvider>
        <div className='col-span-6 lg:col-span-7'>
          {message && <div className='text-center text-red-500'>{message}</div>}
          <ElementsCheckoutForm
            handleSubmit={handleSubmit}
            setPaymentMethod={setPaymentMethod}
            isProcessing={isProcessing}
          />
        </div>
      </CheckoutProvider>
    </Elements>
  );
}
