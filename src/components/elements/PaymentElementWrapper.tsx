import { useConfigContext } from '@/contexts/ConfigContext';
import { PaymentElement } from '@stripe/react-stripe-js';
import { StripePaymentElementOptions } from '@stripe/stripe-js';
import { useEffect, useState } from 'react';

interface PaymentElementWrapperParams {
  setPaymentMethod: (paymentMethod: string) => void;
}

export default function PaymentElementWrapper({
  setPaymentMethod,
}: PaymentElementWrapperParams) {
  const { customer, settings } = useConfigContext();
  const [loading, setLoading] = useState(true);

  const options: StripePaymentElementOptions = {
    layout: settings?.elementsStyle || 'tabs',
    // defaultValues: {
    //   billingDetails: {
    //     name: "Jenny Rosen",
    //     phone: "2015550123",
    //     email: customer?.email,
    //   },
    // },
  };

  useEffect(() => {
    if (customer) {
      setLoading(false);
    }
  }, [customer, options?.defaultValues?.billingDetails]);

  return (
    <div className='mt-2'>
      {!loading && (
        <PaymentElement
          id='payment-element'
          options={options}
          onChange={(e) => setPaymentMethod(e.value.type)}
        />
      )}
    </div>
  );
}
