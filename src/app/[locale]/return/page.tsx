'use client';

import { useEffect, useState, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'next-i18next';
import { useConfigContext } from '@/contexts/ConfigContext';
import fetchClient from '@/utils/fetchClient';
import Stripe from 'stripe';
import { DEMO_MODES } from '@/config/demoModes';

function ReturnPageContent() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    settings,
    customer,
    demoMode,
    triggerSubscriptionRefresh,
  } = useConfigContext();
  /** Prefer `[locale]` from the URL — `settings.language` can be `default` or out of sync. */
  const locale =
    (typeof params?.locale === 'string' && params.locale) ||
    settings?.language ||
    'en';
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) {
      // Settings are not yet available, do nothing.
      return;
    }

    // Save payment method to customer
    const savePaymentMethod = async (
      customerId: string | undefined,
      intent: string | null,
    ) => {
      if (!customerId || !intent) {
        throw new Error(
          'Missing required parameters for saving payment method',
        );
      }

      await fetchClient.post('/api/stripe/payment-method', {
        customerId,
        intent,
      });
    };

    // Process return payment details
    const handleReturn = async () => {
      try {
        const method = searchParams.get('method');
        const type = searchParams.get('type');

        // Handle setup intent redirect from PaymentMethod elements flow
        if (method === 'elements' && type === 'save') {
          const setupIntentId = searchParams.get('setup_intent');
          const redirectStatus = searchParams.get('redirect_status');

          if (!customer?.stripeCustomerId) {
            throw new Error('No Stripe customer linked to this account');
          }

          if (redirectStatus !== 'succeeded') {
            throw new Error(`Payment setup failed with status: ${redirectStatus}`);
          }

          if (setupIntentId) {
            await savePaymentMethod(customer.stripeCustomerId, setupIntentId);
          }

          router.replace(`/${locale}/settings`);
          return;
        }

        const sessionId = searchParams.get('session_id');

        if (!sessionId) {
          throw new Error('No session ID found');
        }

        if (!customer?.stripeCustomerId) {
          throw new Error('No Stripe customer linked to this account');
        }

        // Fetch session data
        const { data: sessionData } =
          await fetchClient.get<Stripe.Checkout.Session>(
            `/api/stripe/checkout-session/${sessionId}`,
          );

        // Check for incomplete session
        if (sessionData.status !== 'complete') {
          console.log(
            `Warning: checkout-session not completed, status: ${sessionData.status}`,
          );
          setError(
            'Checkout session not completed, please try again. If the problem persists, please contact support.',
          );
          return;
        }

        // Update the customer's saved payment method
        const intent = sessionData.setup_intent || sessionData.payment_intent;
        await savePaymentMethod(customer.stripeCustomerId, intent as string);

        const meta = (sessionData.metadata ?? {}) as Record<string, string | undefined>;
        const rawUpgrade = meta.isUpgrade;
        const isUpgrade =
          rawUpgrade === 'true' || rawUpgrade === '1' || rawUpgrade === 'True';
        const currentSubscriptionId = meta.currentSubscriptionId;
        const billingCadenceId = meta.billingCadenceId;

        // If the checkout is complete and this is an upgrade, cancel the current subscription
        if (isUpgrade && currentSubscriptionId && billingCadenceId) {
          // Cancel the current subscription
          await fetchClient.post(
            '/api/stripe/pricing-plan-subscription/cancel',
            {
              customerId: customer.stripeCustomerId,
              pricingPlanSubscriptionId: currentSubscriptionId,
              billingCadenceId: billingCadenceId,
              enableAutomaticReenrollment: false,
            },
          );

          // Refresh subscription data in the
          await triggerSubscriptionRefresh();
        }

        router.replace(`/${locale}${DEMO_MODES[demoMode].route}`);
      } catch (err) {
        console.error('Error handling return:', err);
        setError(
          'An error occurred while processing your request. Please try again.',
        );
      } finally {
        setIsLoading(false);
      }
    };

    handleReturn();
  }, [
    customer?.stripeCustomerId,
    demoMode,
    router,
    searchParams,
    settings,
    locale,
    triggerSubscriptionRefresh,
  ]);

  if (isLoading) {
    return (
      <div className='min-h-screen bg-background flex items-center justify-center'>
        <div className='text-xl font-semibold'>{t('loading')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='min-h-screen bg-background flex items-center justify-center'>
        <div className='text-red-500'>{error}</div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-background flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8'>
      <div className='max-w-md w-full space-y-8'>
        <div>
          <h2 className='mt-6 text-center text-3xl font-extrabold text-text-color'>
            {t('return.title')}
          </h2>
        </div>
        <div className='bg-white p-8 rounded-lg shadow-md'>
          <div className='space-y-6'>{t('return.please_wait')}</div>
        </div>
      </div>
    </div>
  );
}

export default function ReturnPage() {
  return (
    <Suspense
      fallback={
        <div className='min-h-screen bg-background flex items-center justify-center'>
          <div className='text-xl font-semibold'>Loading...</div>
        </div>
      }
    >
      <ReturnPageContent />
    </Suspense>
  );
}
