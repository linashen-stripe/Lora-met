import { ExpressCheckoutElement } from '@stripe/react-stripe-js';
import { StripeExpressCheckoutElementShippingAddressChangeEvent } from '@stripe/stripe-js';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function ExpressCheckoutElementWrapper({
  confirm,
  setAddress,
}: any) {
  const { t } = useTranslation();
  const [visibility, setVisibility] = useState('hidden opacity-0');

  const onReady = ({ availablePaymentMethods }: any) => {
    if (!availablePaymentMethods || availablePaymentMethods.length === 0) {
      return;
    }

    setVisibility('');
  };

  const addressChanged = (
    event: StripeExpressCheckoutElementShippingAddressChangeEvent,
  ) => {
    setAddress(event.address);
  };

  return (
    <div
      id='express-checkout-section'
      className={`${visibility} transition-opacity duration-500`}
    >
      <ExpressCheckoutElement
        onReady={onReady}
        onConfirm={confirm}
        onShippingAddressChange={addressChanged}
      />

      <div id='express-checkout-separator' className='relative my-8'>
        <div className='absolute inset-0 flex items-center' aria-hidden='true'>
          <div className='w-full border-t border-dark'></div>
        </div>
        <div className='relative flex justify-center'>
          <span className='bg-white px-4 text-sm font-bold text-light'>
            {t('checkout.or')}
          </span>
        </div>
      </div>
    </div>
  );
}
