'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon } from '@heroicons/react/24/outline';
import {
  loadStripe,
  type StripeCheckoutFormConfirmEvent,
} from '@stripe/stripe-js';
import {
  CheckoutForm,
  CheckoutFormProvider,
  useCheckoutForm,
} from '@stripe/react-stripe-js/checkout';
import { useTranslation } from 'react-i18next';
import fetchClient from '@/utils/fetchClient';
import { useConfigContext } from '@/contexts/ConfigContext';
import { getEffectiveMetronomeCustomerId } from '@/config/metronomeDefaults';
import { getStripeLocale } from '@/utils/stripe/localeUtils';
import { useApiInspector } from '@/contexts/ApiInspectorContext';

interface CheckoutData {
  clientSecret: string;
  sessionId: string;
}

interface ModalProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  onCreditsPurchased?: () => void;
}

interface CheckoutFormContentProps {
  onComplete: () => Promise<void>;
  layout: 'compact' | 'expanded';
}

function CheckoutFormContent({ onComplete, layout }: CheckoutFormContentProps) {
  const { t } = useTranslation();
  const checkoutState = useCheckoutForm();
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async (event: StripeCheckoutFormConfirmEvent) => {
    if (checkoutState.type !== 'success') return;
    setError(null);
    const result = await checkoutState.checkout.confirm({
      formConfirmEvent: event,
      redirect: 'if_required',
      returnUrl: window.location.href,
    });
    if (result.type === 'error') {
      setError(result.error.message);
      return;
    }
    if (result.session.status.type === 'complete') {
      await onComplete();
      return;
    }
    setError(t('modals.purchase_credits.checkout_verify_failed'));
  };

  if (checkoutState.type === 'loading') {
    return (
      <div className='py-16 text-center text-gray-500'>
        {t('modals.purchase_credits.checkout_loading')}
      </div>
    );
  }

  if (checkoutState.type === 'error') {
    return (
      <p className='rounded-md bg-red-50 p-3 text-sm text-red-700'>
        {checkoutState.error.message}
      </p>
    );
  }

  return (
    <div className='space-y-4'>
      <CheckoutForm options={{ layout }} onConfirm={handleConfirm} />
      {error && (
        <p className='rounded-md bg-red-50 p-3 text-sm text-red-700'>{error}</p>
      )}
    </div>
  );
}

export default function MetronomeCreditCheckoutModal({
  open,
  setOpen,
  onCreditsPurchased,
}: ModalProps) {
  const { t } = useTranslation();
  const {
    settings,
    customer,
    metronomeContract,
    demoMode,
    updateCustomer,
    triggerMetronomeContractRefresh,
  } = useConfigContext();
  const { isOpen: isApiInspectorOpen } = useApiInspector();
  const checkoutFormLayout =
    settings?.checkoutFormLayout === 'expanded' ? 'expanded' : 'compact';
  const [checkoutData, setCheckoutData] = useState<CheckoutData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wasOpen = useRef(false);

  const stripePromise = useMemo(() => {
    if (!settings?.stripePublishableKey) return null;
    return loadStripe(settings.stripePublishableKey, {
      locale: getStripeLocale(settings.language),
    });
  }, [settings?.language, settings?.stripePublishableKey]);

  const createCheckout = useCallback(async () => {
    const metronomeCustomerId = getEffectiveMetronomeCustomerId(customer);
    if (!metronomeCustomerId || !metronomeContract?.id) {
      setError(t('modals.purchase_credits.checkout_missing_contract'));
      return;
    }
    if (!settings?.stripePublishableKey) {
      setError(t('modals.purchase_credits.checkout_create_failed'));
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const uiMode =
        settings.checkoutMethod === 'hosted_page' ? 'hosted_page' : 'form';
      const { data } = await fetchClient.post(
        '/api/stripe/metronome-credit-checkout',
        {
          metronomeCustomerId,
          contractId: metronomeContract.id,
          demoMode,
          creditTypeId: metronomeContract.creditTypeId,
          currency: settings.currency || 'usd',
          language: settings.language || 'en',
          uiMode,
        },
      );
      if (uiMode === 'hosted_page' && data.url) {
        window.location.assign(data.url);
        return;
      }
      setCheckoutData({
        clientSecret: data.clientSecret,
        sessionId: data.sessionId,
      });
    } catch (requestError: any) {
      setError(
        requestError.response?.data?.error ||
          t('modals.purchase_credits.checkout_create_failed'),
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    customer,
    demoMode,
    metronomeContract?.creditTypeId,
    metronomeContract?.id,
    settings?.checkoutMethod,
    settings?.currency,
    settings?.language,
    settings?.stripePublishableKey,
    t,
  ]);

  useEffect(() => {
    if (!open) {
      wasOpen.current = false;
      return;
    }
    if (wasOpen.current) return;
    wasOpen.current = true;
    setCheckoutData(null);
    setError(null);
    setIsWaiting(false);
    void createCheckout();
  }, [createCheckout, open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open, setOpen]);

  const handleComplete = async () => {
    if (!checkoutData) return;
    setIsWaiting(true);
    setError(null);
    try {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const { data } = await fetchClient.get(
          `/api/stripe/metronome-credit-checkout?session_id=${encodeURIComponent(
            checkoutData.sessionId,
          )}`,
        );
        if (data.ready) {
          await triggerMetronomeContractRefresh();
          updateCustomer({ forceSubscriptionRepoll: new Date() });
          onCreditsPurchased?.();
          setOpen(false);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      setError(t('modals.purchase_credits.checkout_commit_pending'));
    } catch (requestError: any) {
      setError(
        requestError.response?.data?.error ||
          t('modals.purchase_credits.checkout_verify_failed'),
      );
    } finally {
      setIsWaiting(false);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className='relative z-50'>
      <div aria-hidden='true' className='fixed inset-0 bg-gray-900/75' />
      <div className='fixed inset-0 z-50 w-full overflow-y-auto'>
        <div
          className={`flex min-h-full items-center justify-center p-2 sm:p-4 ${
            isApiInspectorOpen ? 'md:pr-96 xl:pr-[32rem]' : ''
          }`}
        >
          <div
            role='dialog'
            aria-modal='false'
            aria-labelledby='metronome-checkout-title'
            className='relative max-h-[calc(100dvh-1rem)] w-full max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl bg-white p-4 text-left shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:max-w-2xl sm:p-6'
          >
            <button
              type='button'
              onClick={() => setOpen(false)}
              aria-label={t('common.close')}
              className='absolute right-4 top-4 text-gray-400 hover:text-gray-600'
            >
              <XMarkIcon className='h-6 w-6' />
            </button>
            <h3
              id='metronome-checkout-title'
              className='pr-8 text-lg font-semibold text-gray-900'
            >
              {t('modals.purchase_credits.checkout_flow')}
            </h3>

            <div className='mt-5'>
              {isLoading || isWaiting ? (
                <div className='py-16 text-center text-gray-500'>
                  {isWaiting
                    ? t('modals.purchase_credits.checkout_waiting_for_commit')
                    : t('modals.purchase_credits.checkout_loading')}
                </div>
              ) : error ? (
                <div className='space-y-4 py-10 text-center'>
                  <p className='text-sm text-red-700'>{error}</p>
                  <button
                    type='button'
                    onClick={() => void createCheckout()}
                    className='rounded-md bg-purple px-4 py-2 text-sm font-semibold text-button-color hover:bg-purple-hover'
                  >
                    {t('modals.purchase_credits.checkout_retry')}
                  </button>
                </div>
              ) : checkoutData && stripePromise ? (
                <CheckoutFormProvider
                  stripe={stripePromise}
                  options={{
                    clientSecret: checkoutData.clientSecret,
                    appearance: { theme: 'stripe' },
                    savedPaymentMethod: {
                      enableRedisplay: 'auto',
                      enableSave: 'auto',
                    },
                  }}
                >
                  <CheckoutFormContent
                    layout={checkoutFormLayout}
                    onComplete={handleComplete}
                  />
                </CheckoutFormProvider>
              ) : (
                <div className='py-16 text-center text-gray-500'>
                  {t('modals.purchase_credits.checkout_loading')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
