'use client';

import { useState, useEffect } from 'react';
import { useConfigContext } from '@/contexts/ConfigContext';
import { getCheckoutStrategy } from '@/utils/checkoutStrategies';
import { useCart } from '@/contexts/CartContext';
import fetchClient from '@/utils/fetchClient';
import useElementsHighlight from '../hooks/elementsHighlight';

interface CheckoutData {
  clientSecret?: string;
  redirectUrl?: string;
}

export default function CheckoutContent() {
  const { settings } = useConfigContext();
  const { items } = useCart();
  const [checkoutData, setCheckoutData] = useState<CheckoutData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkoutMethod = settings?.checkoutMethod ?? '';

  useElementsHighlight();

  useEffect(() => {
    const initializeCheckout = async () => {
      setLoading(true);
      setError(null);

      try {
        const strategy = getCheckoutStrategy(checkoutMethod);
        const safeCart = Array.isArray(items) ? items : [];
        const safeSettings = settings || {};

        let data: CheckoutData;

        if (checkoutMethod === 'embedded-checkout') {
          const response = await fetchClient.post(
            '/api/stripe/checkout-session',
            {
              cart: safeCart,
              settings: safeSettings,
              mode: 'embedded',
            },
          );
          data = response.data;
        } else {
          data = await strategy.initializeCheckout(safeCart, safeSettings);
        }

        setCheckoutData(data);
      } catch (err) {
        setError('Failed to initialize checkout. Please try again.');
        console.error('Checkout initialization error:', err);
      } finally {
        setLoading(false);
      }
    };

    initializeCheckout();
  }, [checkoutMethod, items, settings]);

  const strategy = getCheckoutStrategy(checkoutMethod);

  if (loading && settings?.checkoutMethod !== 'stripe-checkout') {
    return <span className='text-black'>Loading checkout...</span>;
  }

  if (error) {
    return <span className='text-red-600'>{error}</span>;
  }

  if (!checkoutData || !settings) {
    return null;
  }

  return (
    <div id='checkout-content-page' className='mx-auto max-w-4xl lg:max-w-7xl'>
      {strategy.renderCheckout(checkoutData, settings)}
    </div>
  );
}
