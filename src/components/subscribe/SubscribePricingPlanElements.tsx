'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { useConfigContext } from '@/contexts/ConfigContext';
import fetchClient from '@/utils/fetchClient';
import ErrorBanner from '../ui/ErrorBanner';
import { formatPrice } from '@/utils/helpers';
import { LoadingOverlay } from '@/components';
import { Elements } from '@stripe/react-stripe-js';
import {
  StripeElementsOptions,
  Appearance,
  loadStripe,
} from '@stripe/stripe-js';
import appearance from '../config/Appearance';
import PaymentElementWrapper from '../elements/PaymentElementWrapper';
import { getStripeLocale } from '@/utils/stripe/localeUtils';
import { useSearchParams } from 'next/navigation';
import Stripe from 'stripe';
import useElementsPricingPlanCheckout from './useElementsPricingPlanCheckout';

const SubscribePricingPlanForm = ({
  stripePromise,
}: {
  stripePromise: any;
}) => {
  const { t } = useTranslation();
  const { settings, subscription: currentSubscription } = useConfigContext();
  const [plan, setPlan] = useState<Stripe.V2.Billing.PricingPlan | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const isUpgrade = searchParams.get('upgrade') === 'true';

  useEffect(() => {
    // Don't fetch if settings haven't loaded yet
    if (!settings?.currency) return;

    const currency = settings?.currency || 'usd';
    const premiumPlanLookupKey = `llama_ai_premium_plan_${currency}`;

    fetchClient
      .get(`/api/stripe/pricing-plan?lookup_keys=${premiumPlanLookupKey}`)
      .then(({ data }) => {
        setPlan(data.plans[0]);
      })
      .catch((e) => {
        console.error('Error: ', e);
        setMessage('Unable to fetch pricing plans.');
      });
  }, [settings?.currency]);

  const { billingIntent, errorMessage, handleSubmit, isProcessing } =
    useElementsPricingPlanCheckout({ isUpgrade });

  if (!stripePromise || !billingIntent || !plan) {
    return <LoadingOverlay />;
  }

  return (
    <div className='min-h-screen bg-background flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8'>
      <div className='max-w-md w-full space-y-8'>
        <div>
          <h2 className='text-2xl font-bold text-center mb-6 text-text-color'>
            {isUpgrade
              ? `${t('settings.subscription.upgrade')} → ${t('subscription_pro.title')}`
              : t('subscription_pro.title')}
          </h2>
        </div>

        <div className='bg-white p-8 rounded-lg shadow-md'>
          {message && <ErrorBanner message={message} />}

          <div className='bg-gray-100 p-4 rounded-md mt-4 mb-6'>
            <div className='flex justify-between font-semibold'>
              <span>{t('subscription_pro.total')}</span>
              <span>
                {formatPrice(
                  billingIntent?.amount_details?.total ?? 0,
                  settings?.language,
                  settings?.currency?.toLowerCase() || 'usd',
                )}{' '}
                + {t('subscription_pro.usage_total')}
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            {errorMessage && <ErrorBanner message={errorMessage} />}
            <PaymentElementWrapper setPaymentMethod={() => {}} />
            <button
              disabled={isProcessing}
              className='w-full mt-4 bg-purple text-button-color py-2 px-4 rounded-md hover:bg-purple-hover transition duration-300 disabled:bg-gray-400'
            >
              {isProcessing
                ? t('common.processing')
                : t('subscription_pro.subscribe')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

const SubscribePricingPlanElements = () => {
  const { settings } = useConfigContext();
  const [stripePromise, setStripePromise] = useState<any>(null);

  useEffect(() => {
    if (settings?.stripePublishableKey) {
      setStripePromise(
        loadStripe(settings.stripePublishableKey, {
          locale: getStripeLocale(settings?.language || 'en'),
        }),
      );
    }
  }, [settings?.stripePublishableKey, settings?.language]);

  const options: StripeElementsOptions = {
    mode: 'setup',
    currency: settings?.currency?.toLowerCase() || 'usd',
    appearance: appearance as Appearance,
    paymentMethodCreation: 'manual',
  };

  return (
    <Elements stripe={stripePromise} options={options}>
      <SubscribePricingPlanForm stripePromise={stripePromise} />
    </Elements>
  );
};

export default SubscribePricingPlanElements;
