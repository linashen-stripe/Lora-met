import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useConfigContext } from '@/contexts/ConfigContext';
import { useCart } from '@/contexts/CartContext';
import { CheckoutProvider, useCheckout } from '@stripe/react-stripe-js';
import {
  loadStripe,
  StripeCustomCheckoutOptions,
  Appearance,
} from '@stripe/stripe-js';
import fetchClient from '@/utils/fetchClient';
import appearance from '../config/Appearance';
import { getStripeLocale } from '@/utils/stripe/localeUtils';
import { EWCSCheckoutForm } from '../elements/EWCSCheckoutForm';
import updateCustomerInfo from '../hooks/useUpdateCustomerInfo';

interface CheckoutSession {
  id: string;
  clientSecret: string;
  return_url: string;
  status?: string;
  customer?: string;
  metadata?: Record<string, string>;
}

const useCreateCheckoutSession = () => {
  const [checkoutSession, setCheckoutSession] = useState<CheckoutSession>();
  const [isFetching, setIsFetching] = useState(false);
  const { customer, settings } = useConfigContext();
  const { items } = useCart();
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (hasFetchedRef.current || isFetching || !customer?.id) return;
    const createSession = async () => {
      setIsFetching(true);
      try {
        const type = items[0].type;

        // Use pricing plan checkout session instead
        const result = await fetchClient.post('/api/stripe/checkout-session', {
          customerId: customer.id,
          items,
          type,
          settings,
          paymentMethod: 'card',
        });

        setCheckoutSession(result.data);
      } catch (error) {
        console.error('Error creating checkout session:', error);
      } finally {
        setIsFetching(false);
      }
    };

    createSession();
  }, [customer?.id, items, settings]);

  return { data: checkoutSession, isFetching };
};

const useHandleCallbacks = () => {
  const { settings } = useConfigContext();

  const handleStripeCheckoutStatus = useCallback(
    (status: any) => {
      if (status === 'succeeded') {
        window.location.href = `${window.location.origin}/${settings?.language}/processing`;
      }
    },
    [settings?.language],
  );

  const handleStripeCheckoutConfirmResult = useCallback(
    (result: any) => {
      if (result?.error) {
        console.error('Payment failed:', result.error);
      }

      if (result?.paymentIntent?.status === 'succeeded') {
        window.location.href = `${window.location.origin}/${settings?.language}/processing`;
      }
    },
    [settings?.language],
  );

  return { handleStripeCheckoutStatus, handleStripeCheckoutConfirmResult };
};

export default function ElementsWithCheckoutSessionsCheckout() {
  const { settings } = useConfigContext();
  const { items } = useCart();
  const stripePromise = useMemo(() => {
    if (!settings?.stripePublishableKey) {
      return null;
    }

    return loadStripe(settings?.stripePublishableKey, {
      locale: getStripeLocale(settings?.language || 'en'),
      betas: ['custom_checkout_beta_5', 'custom_checkout_server_updates_1'],
    });
  }, [settings?.stripePublishableKey, settings?.language]);

  const { data: checkoutSession, isFetching: isFetchingCheckoutSession } =
    useCreateCheckoutSession();

  const optionsWithClientSecret = useMemo<
    StripeCustomCheckoutOptions | undefined
  >(() => {
    if (!checkoutSession?.clientSecret) {
      return;
    }

    return {
      clientSecret: checkoutSession.clientSecret,
      elementsOptions: {
        appearance: appearance as Appearance,
      },
    } satisfies StripeCustomCheckoutOptions;
  }, [checkoutSession?.clientSecret]);

  return (
    <div className='mx-auto max-w-4xl lg:max-w-7xl'>
      {isFetchingCheckoutSession ||
      checkoutSession?.clientSecret === undefined ||
      optionsWithClientSecret === undefined ? (
        <div className='flex justify-center'>
          <div className='animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900'></div>
        </div>
      ) : (
        <CheckoutProvider
          stripe={stripePromise}
          options={optionsWithClientSecret}
          key={checkoutSession.clientSecret}
        >
          <ElementsWithCheckoutSessionsContent
            returnUrl={`${window.location.origin}/${settings?.language}/dashboard`}
          />
        </CheckoutProvider>
      )}
    </div>
  );
}

const ElementsWithCheckoutSessionsContent = ({
  returnUrl,
}: {
  returnUrl: string;
}) => {
  const { confirm, total } = useCheckout();
  const { customer } = useConfigContext();
  const { setTax } = useCart();
  const [isConfirming, setIsConfirming] = useState(false);
  const { handleStripeCheckoutConfirmResult } = useHandleCallbacks();
  const [userAddress, setUserAddress] = useState<any | undefined>(undefined);
  const [name, setName] = useState<string | undefined>(undefined);

  const addressRef = useRef(userAddress);
  const nameRef = useRef(name);

  useEffect(() => {
    addressRef.current = userAddress;
    nameRef.current = name;
  }, [userAddress, name]);

  useEffect(() => {
    if (total) {
      const taxInclusive = total.taxInclusive || 0;
      const taxExclusive = total.taxExclusive || 0;
      const amount = taxInclusive + taxExclusive;
      const inclusive = taxInclusive > 0;

      setTax(amount, inclusive);
    }
  }, [total, userAddress]);

  const onConfirm = useCallback(async () => {
    setIsConfirming(true);

    if (addressRef.current && customer?.id) {
      await updateCustomerInfo(
        { name: nameRef.current, address: addressRef.current },
        customer?.id,
      );
    }

    const confirmResult = await confirm({
      returnUrl: returnUrl,
      redirect: 'always',
    });

    setIsConfirming(false);
    handleStripeCheckoutConfirmResult(confirmResult);
  }, [confirm, handleStripeCheckoutConfirmResult]);

  const handleAddress = (value: { name: string; address: any }) => {
    setUserAddress(value.address);
    setName(value.name);
  };

  return (
    <div className='grid gap-x-12 xl:gap-x-16'>
      <div className='grid gap-y-4'>
        <EWCSCheckoutForm
          onConfirm={onConfirm}
          isProcessing={isConfirming}
          setAddress={handleAddress}
        />
      </div>
    </div>
  );
};
