import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import {
  loadStripe,
  StripeElementsOptions,
  Stripe,
  StripeElements,
  Appearance,
  StripeElementLocale,
} from '@stripe/stripe-js';
import { CheckoutProvider } from '@/contexts/CheckoutContext';
import { useConfigContext } from '@/contexts/ConfigContext';
import fetchClient from '@/utils/fetchClient';
import appearance from '@/components/config/Appearance';
import ErrorBanner from '@/components/ui/ErrorBanner';
import SuccessBanner from '@/components/ui/SuccessBanner';
import useElementsHighlight from '@/components/hooks/elementsHighlight';
import { getStripeLocale } from '@/utils/stripe/localeUtils';
import { getStripeCustomerIdFromCustomer } from '@/config/metronomeDefaults';
import { dashboardKeys } from '@/components/dashboard/useDashboardData';

const StripeWrappedSubscribeButton = ({
  onClick,
  isProcessing,
}: {
  onClick: (stripe: Stripe | null, elements: StripeElements | null) => void;
  isProcessing: boolean;
}) => {
  const { t } = useTranslation();
  const stripe = useStripe();
  const elements = useElements();

  return (
    <button
      type='button'
      onClick={() => onClick(stripe, elements)}
      disabled={isProcessing || !stripe || !elements}
      className='my-2 w-full rounded-md bg-accent px-4 py-2 text-accent-foreground transition duration-300 hover:bg-purple-hover disabled:opacity-50'
    >
      {isProcessing
        ? t('return.please_wait')
        : t('settings.payment.replace')}
    </button>
  );
};

interface PaymentMethodProps {
  subscription: any | null;
}

const PaymentMethod = ({ subscription }: PaymentMethodProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { customer, settings, updateCustomer } = useConfigContext();
  const [showUpdateElement, setShowUpdateElement] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const stripeCustomerId = getStripeCustomerIdFromCustomer(customer);

  useElementsHighlight();

  const stripePromise = useMemo(() => {
    if (!settings?.stripePublishableKey) return null;

    return loadStripe(settings.stripePublishableKey, {
      locale: getStripeLocale(settings?.language || 'en'),
    }).catch(() => null);
  }, [settings?.stripePublishableKey, settings?.language]);

  const options: StripeElementsOptions = useMemo(
    () => ({
      mode: 'setup',
      setupFutureUsage: 'off_session',
      fonts: [{ cssSrc: 'https://fonts.googleapis.com/css?family=Aleo' }],
      currency: settings?.currency,
      appearance: appearance as Appearance,
      defaultValues: {
        billingDetails: {
          email: customer?.email,
          name: customer?.name,
        },
      },
      locale: (settings?.language || 'en') as StripeElementLocale,
    }),
    [
      customer?.email,
      customer?.name,
      settings?.currency,
      settings?.language,
    ],
  );

  const handleSubmit = useCallback(
    async (stripe: Stripe | null, elements: StripeElements | null) => {
      if (!stripe || !elements) return;

      setIsProcessing(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      try {
        if (!stripeCustomerId) {
          throw new Error(t('payments.errors.unexpected_error'));
        }
        const { error: submitError } = await elements.submit();
        if (submitError) {
          throw new Error(
            submitError.message || t('payments.errors.validation_error'),
          );
        }

        const { data } = await fetchClient.get('/api/stripe/payment-method', {
          params: {
            customerId: stripeCustomerId,
            language: settings?.language,
          },
        });

        // Always use the tab’s origin — not NEXT_PUBLIC_BASE_URL (often wrong port/host in .env, e.g. :8080).
        const { error, setupIntent } = await stripe.confirmSetup({
          elements,
          clientSecret: data.clientSecret,
          confirmParams: {
            return_url: `${window.location.origin}/${settings?.language}/return?method=elements&type=save`,
          },
          redirect: 'if_required',
        });

        if (error) {
          throw new Error(
            error.message || t('payments.errors.unexpected_error'),
          );
        } else {
          if (setupIntent?.status !== 'succeeded') {
            throw new Error(t('payments.errors.unexpected_error'));
          }
          await fetchClient.post('/api/stripe/payment-method', {
            customerId: stripeCustomerId,
            intent: setupIntent.id,
          });
          await queryClient.invalidateQueries({
            queryKey: dashboardKeys.all,
          });
          setShowUpdateElement(false);
          updateCustomer({ forceSubscriptionRepoll: new Date() });
          setSuccessMessage(t('payments.success.payment_updated'));
        }
      } catch (err: any) {
        setErrorMessage(err.message || t('payments.errors.unexpected_error'));
      } finally {
        setIsProcessing(false);
      }
    },
    [
      queryClient,
      settings?.language,
      stripeCustomerId,
      t,
      updateCustomer,
    ],
  );

  const renderPaymentMethod = () => {
    if (
      !subscription ||
      (!subscription.customer?.invoice_settings.default_payment_method &&
        !subscription.default_payment_method &&
        !subscription.metadata?.external_payment_method)
    ) {
      return (
        <div className='rounded-md bg-muted/50 px-6 py-5 flex items-center justify-between'>
          <div className='flex items-center'>
            <div className='mt-1 text-sm text-gray-600'>
              {t('settings.payment.no_payment_method')}
            </div>
          </div>
          <div className='flex-shrink-0'>
            <button
              disabled
              className='inline-flex cursor-not-allowed items-center rounded-md bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-400 shadow-sm ring-1 ring-inset ring-gray-200'
            >
              {t('settings.payment.add')}
            </button>
          </div>
        </div>
      );
    }

    const default_payment_method = subscription.metadata
      ?.external_payment_method
      ? {
          name: t('settings.payment.external_payment_method'),
          type: subscription.metadata?.external_payment_method,
        }
      : subscription.customer?.invoice_settings.default_payment_method ||
        subscription.default_payment_method;
    const { name, type } = default_payment_method;
    const brand = default_payment_method[type]?.brand || type;
    const last4 = ['card', 'us_bank_account'].includes(type)
      ? default_payment_method[type].last4
      : null;

    const prettyType =
      type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
    const prettyName = name
      ? name
          .split(' ')
          .map(
            (word: string) =>
              word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
          )
          .join(' ')
      : null;

    const knownTypes = [
      'card',
      'link',
      'us_bank_account',
      'sepa_debit',
      'cashapp',
    ];
    const knownBrands = [
      'discover',
      'amex',
      'visa',
      'mastercard',
      'cartes_bancaires',
    ];

    let imgSrc = '/img/payment-methods/unknown.svg';
    if (type === 'card' && knownBrands.includes(brand)) {
      imgSrc = `/img/payment-methods/${brand}.svg`;
    } else if (type !== 'card' && knownTypes.includes(type)) {
      imgSrc = `/img/payment-methods/${type}.svg`;
    }

    return (
      <div className='rounded-md bg-muted/50 px-6 py-5 flex items-center justify-between'>
        <div className='flex items-center'>
          {imgSrc && (
            <img
              src={imgSrc}
              alt={prettyType}
              width={30}
              height={30}
              className='mr-4 flex-shrink-0'
            />
          )}
          <div>
            <div className='text-sm font-medium text-gray-900'>
              {prettyType}
              {last4 && t('settings.payment.ending_with', { last4 })}
            </div>
            {prettyName && (
              <div className='mt-1 text-sm text-gray-600'>{prettyName}</div>
            )}
          </div>
        </div>
        <div className='flex-shrink-0'>
          <button
            type='button'
            onClick={() => {
              setErrorMessage(null);
              setSuccessMessage(null);
              setShowUpdateElement(true);
            }}
            disabled={!stripeCustomerId || isProcessing}
            className='inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400'
          >
            {t('settings.payment.replace')}
          </button>
        </div>
      </div>
    );
  };

  const applyPromoCode = async () => {
    if (!promoCode || !subscription) return;

    setIsApplyingPromo(true);
    try {
      // Legacy subscription promo code no longer supported
      console.error('Legacy subscription promo code is no longer available.');
      setErrorMessage(t('payments.errors.promo_not_available'));
      setPromoCode('');
    } catch (error) {
      setErrorMessage(t('payments.errors.promo_failed'));
    } finally {
      setIsApplyingPromo(false);
    }
  };

  const renderPromoCodeSection = () => {
    if (showUpdateElement) return null; // Don't show promo code section when payment element is visible

    return (
      <div className='rounded-md bg-muted/50px-6 py-5 flex items-center justify-between mt-3'>
        <h4 className='text-sm font-medium text-gray-900'>
          {t('settings.payment.promo_code')}
        </h4>
        <div className='flex items-center'>
          <input
            type='text'
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value)}
            placeholder={t('settings.payment.enter_promo_code')}
            className='flex-grow mr-2 px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:ring-ring focus:border-primary'
          />
          <button
            onClick={applyPromoCode}
            disabled={isApplyingPromo || !promoCode}
            className='inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50'
          >
            {isApplyingPromo
              ? t('settings.payment.applying')
              : t('settings.payment.apply')}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className='bg-white shadow sm:rounded-lg mt-4'>
      <div className='px-4 py-5 sm:p-6'>
        <h3 className='text-base font-semibold leading-6 text-gray-900 mb-2'>
          {t('settings.payment.title')}
        </h3>

        {errorMessage && <ErrorBanner message={errorMessage} />}
        {successMessage && <SuccessBanner message={successMessage} />}

        <div className='mt-2'>
          {renderPaymentMethod()}
          {/* {renderPromoCodeSection()} */}

          {showUpdateElement && (
            <div className='mt-4 grid gap-y-4'>
              <Elements stripe={stripePromise} options={options}>
                <CheckoutProvider>
                  <PaymentElement />
                  <StripeWrappedSubscribeButton
                    onClick={handleSubmit}
                    isProcessing={isProcessing}
                  />
                </CheckoutProvider>
              </Elements>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentMethod;
