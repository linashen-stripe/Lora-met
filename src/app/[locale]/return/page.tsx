'use client';

import { useEffect, useState, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'next-i18next';
import { useConfigContext } from '@/contexts/ConfigContext';
import fetchClient from '@/utils/fetchClient';

function ReturnPageContent() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { settings, customer } = useConfigContext();
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

        throw new Error('Unsupported return flow');
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
    router,
    searchParams,
    settings,
    locale,
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
