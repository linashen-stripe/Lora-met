'use client';

import React, { useState, useEffect } from 'react';
import { useStripe, useElements } from '@stripe/react-stripe-js';
import { useCheckout } from '@/contexts/CheckoutContext';
import { useTranslation } from 'react-i18next';
import AddressElementWrapper from './AddressElementWrapper';
import PaymentElementWrapper from './PaymentElementWrapper';
import ErrorBanner from '../ui/ErrorBanner';
import {
  Stripe,
  StripeElements,
  StripeEmbeddedCheckoutAddress,
  StripeExpressCheckoutElementConfirmEvent,
} from '@stripe/stripe-js';
import ExpressCheckoutElementWrapper from './ExpressCheckoutElement';
import { useCart } from '@/contexts/CartContext';
import fetchClient from '@/utils/fetchClient';
import { useConfigContext } from '@/contexts/ConfigContext';
import SubscribeButton from '../checkout/SubscribeButton';

interface CheckoutFormParams {
  setPaymentMethod: (paymentMethod: string) => void;
  handleSubmit: (
    stripe: Stripe | null,
    elements: StripeElements | null,
  ) => Promise<void>;
  isProcessing: boolean;
}

export default function CheckoutForm({
  setPaymentMethod,
  handleSubmit,
  isProcessing,
}: CheckoutFormParams): React.ReactElement {
  const [message, setMessage] = useState<string | null>(null);
  const { settings, customer } = useConfigContext();
  const { setStripe, setElements } = useCheckout();
  const { items, setTax } = useCart();
  const { t } = useTranslation();

  const stripe = useStripe();
  const elements = useElements();

  const [address, setAddress] = useState<{
    complete: boolean;
    value: { address: StripeEmbeddedCheckoutAddress };
  } | null>(null);

  useEffect(() => {
    const calculateTax = async () => {
      if (!items || !address || !address.complete) {
        setTax(0, false);
        return;
      }

      try {
        const { data } = await fetchClient.post('/api/stripe/tax', {
          items,
          shippingAddress: address.value.address,
          customerId: customer?.id,
        });

        setTax(data.tax, true);
      } catch (err) {
        console.log('Tax calculation error', err);
      }
    };

    calculateTax();
  }, [items, address, setTax, customer?.id]);

  useEffect(() => {
    if (stripe && elements) {
      setStripe(stripe);
      setElements(elements);
    }
  }, [stripe, elements, setStripe, setElements]);

  useEffect(() => {
    if (!stripe) return;

    const clientSecret = new URLSearchParams(window.location.search).get(
      'payment_intent_client_secret',
    );

    if (clientSecret) {
      stripe.retrievePaymentIntent(clientSecret).then(({ paymentIntent }) => {
        if (paymentIntent) {
          switch (paymentIntent.status) {
            case 'succeeded':
              setMessage(t('checkout.payment_status.succeeded'));
              break;
            case 'processing':
              setMessage(t('checkout.payment_status.processing'));
              break;
            case 'requires_payment_method':
              setMessage(t('checkout.payment_status.requires_payment_method'));
              break;
            default:
              setMessage(t('checkout.payment_status.error'));
              break;
          }
        }
      });
    }
  }, [stripe, t]);

  return (
    <div className='col-span-6 lg:col-span-7'>
      {message && <ErrorBanner message={message} />}
      {settings?.eceEnabled && (
        <ExpressCheckoutElementWrapper
          confirm={(event: StripeExpressCheckoutElementConfirmEvent) => {
            setAddress({
              complete: true,
              value: {
                address: event.billingDetails
                  ?.address as StripeEmbeddedCheckoutAddress,
              },
            });
            handleSubmit(stripe, elements);
          }}
          setAddress={() => {}}
        />
      )}
      {settings?.addressEnabled && (
        <AddressElementWrapper setAddress={setAddress} />
      )}
      <PaymentElementWrapper setPaymentMethod={setPaymentMethod} />
      <SubscribeButton
        onClick={() => handleSubmit(stripe, elements)}
        disabled={isProcessing}
      />
    </div>
  );
}
