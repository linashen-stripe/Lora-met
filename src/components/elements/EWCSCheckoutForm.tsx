import AddressElementWrapper from './AddressElementWrapper';
import PaymentElementWrapper from './PaymentElementWrapper';
import { createContext, useContext, useState } from 'react';
import { useConfigContext } from '@/contexts/ConfigContext';
import ErrorBanner from '../ui/ErrorBanner';
import SubscribeButton from '../checkout/SubscribeButton';

type AgnosticElementsCheckoutContextProps = {
  onConfirm: (val?: any) => Promise<void>;
  isProcessing: boolean;
  setAddress: (val: { name: string; address: any }) => void;
};

const AgnosticElementsCheckoutContext =
  createContext<AgnosticElementsCheckoutContextProps>({
    onConfirm: async () => {},
    isProcessing: false,
    setAddress: (val: { name: string; address: any }) => {},
  });

type AgnosticElementsCheckoutProps = AgnosticElementsCheckoutContextProps;

export const EWCSCheckoutForm = (
  elementsCheckoutProps: AgnosticElementsCheckoutProps,
) => {
  const [message, setMessage] = useState<string | null>(null);
  const { settings } = useConfigContext();
  const { onConfirm, isProcessing, setAddress } = elementsCheckoutProps;
  const handleAddressChange = (e: any) => {
    if (e.complete) {
      setAddress({
        name: e.value.name,
        address: e.value.address,
      });
    }
  };
  return (
    <AgnosticElementsCheckoutContext.Provider value={elementsCheckoutProps}>
      <div className='col-span-6 lg:col-span-7'>
        {message && <ErrorBanner message={message} />}
        {/* {settings?.eceEnabled && (
          <ExpressCheckoutElementWrapper
            onConfirm={onConfirm}
            setAddress={handleAddressChange}
          />
        )} */}
        {settings?.addressEnabled && (
          <AddressElementWrapper
            setAddress={(e: any) => handleAddressChange(e)}
          />
        )}
        <PaymentElementWrapper setPaymentMethod={() => null} />
        <SubscribeButton onClick={onConfirm} disabled={isProcessing} />
      </div>
    </AgnosticElementsCheckoutContext.Provider>
  );
};

export const useAgnosticElementsCheckout = () =>
  useContext(AgnosticElementsCheckoutContext);
