'use client';

import React, {
  createContext,
  useContext,
  useState,
  PropsWithChildren,
} from 'react';
import { Stripe, StripeElements } from '@stripe/stripe-js';
import { Dispatch, SetStateAction } from 'react';

interface CheckoutContextProps {
  stripe: Stripe | null;
  setStripe: Dispatch<SetStateAction<null | Stripe>>;
  elements: StripeElements | null;
  setElements: Dispatch<SetStateAction<null | StripeElements>>;
}

const defaultContext: CheckoutContextProps = {
  stripe: null,
  setStripe: () => {},
  elements: null,
  setElements: () => {},
};

const CheckoutContext = createContext<CheckoutContextProps>(defaultContext);

export function CheckoutProvider({ children }: PropsWithChildren<unknown>) {
  const [stripe, setStripe] = useState<Stripe | null>(null);
  const [elements, setElements] = useState<StripeElements | null>(null);

  return (
    <CheckoutContext.Provider
      value={{ stripe, setStripe, elements, setElements }}
    >
      {children}
    </CheckoutContext.Provider>
  );
}

export function useCheckout() {
  return useContext(CheckoutContext);
}
