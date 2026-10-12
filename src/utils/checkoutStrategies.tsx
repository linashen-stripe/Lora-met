import React from 'react';
import fetchClient from './fetchClient';
import {
  ElementsCheckout,
  EmbeddedCheckoutComponent,
  StripeCheckout,
} from '@/components/checkout';
import ElementsWithCheckoutSessionsCheckout from '@/components/checkout/ElementsWithCheckoutSessions';

interface CartItem {
  id: string;
  type: string;
  details?: any;
  quantity?: number;
  price?: number;
}

interface Settings {
  language: string;
}

interface CheckoutData {
  cart?: CartItem[];
  settings?: Settings;
  redirectUrl?: string;
}

class CheckoutStrategy {
  Component: React.ComponentType<any>;
  name: string;

  constructor(Component: React.ComponentType<any>, name: string) {
    this.Component = Component;
    this.name = name;
  }

  async initializeCheckout(
    cart: CartItem[],
    settings: Settings | any,
  ): Promise<CheckoutData> {
    return { cart, settings };
  }

  renderCheckout(
    checkoutData: CheckoutData,
    settings: Settings,
  ): React.ReactElement {
    return <this.Component checkoutData={checkoutData} settings={settings} />;
  }
}

class StripeCheckoutStrategy extends CheckoutStrategy {
  constructor(Component: React.ComponentType<any>) {
    super(Component, 'Stripe Checkout');
  }

  async initializeCheckout(
    cart: CartItem[],
    settings: Settings,
  ): Promise<CheckoutData> {
    if (!cart || Object.keys(cart).length === 0) {
      throw new Error('Cart is empty in StripeCheckoutStrategy');
    }

    try {
      const { data } = await fetchClient.post('/api/stripe/checkout-session', {
        cart,
        settings,
        mode: 'hosted',
      });
      return { redirectUrl: data.url };
    } catch (error) {
      console.error('Error in StripeCheckoutStrategy:', error);
      throw error;
    }
  }
}

class EmbeddedCheckoutStrategy extends CheckoutStrategy {
  constructor(Component: React.ComponentType<any>) {
    super(Component, 'Embedded Checkout');
  }

  async initializeCheckout(
    cart: CartItem[],
    settings: Settings,
  ): Promise<CheckoutData> {
    return { redirectUrl: `/${settings.language}/checkout` };
  }
}

class ElementsCheckoutStrategy extends CheckoutStrategy {
  constructor(Component: React.ComponentType<any>) {
    super(Component, 'Elements Checkout');
  }

  async initializeCheckout(
    cart: CartItem[],
    settings: Settings,
  ): Promise<CheckoutData> {
    return { redirectUrl: `/${settings.language}/checkout` };
  }
}

const checkoutStrategies: {
  [key: string]: CheckoutStrategy;
} = {
  'stripe-checkout': new StripeCheckoutStrategy(StripeCheckout),
  'embedded-checkout': new EmbeddedCheckoutStrategy(EmbeddedCheckoutComponent),
  'elements-checkout': new ElementsCheckoutStrategy(ElementsCheckout),
  'elements-checkout-with-checkout-sessions': new ElementsCheckoutStrategy(
    ElementsWithCheckoutSessionsCheckout,
  ),
};

export function getCheckoutStrategy(method: string): CheckoutStrategy {
  return checkoutStrategies[method] || checkoutStrategies['elements-checkout'];
}
