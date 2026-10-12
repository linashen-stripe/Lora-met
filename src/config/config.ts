'use client';

export const supportedLanguages = [
  'en',
  'fr',
  'es',
  'de',
  'ja',
  'zh',
  'en-GB',
  'it',
  'default',
];

export const defaultDemoSettings = {
  checkoutMethod: process.env.NEXT_PUBLIC_CHECKOUT_METHOD,
  country: process.env.NEXT_PUBLIC_COUNTRY,
  currency: process.env.NEXT_PUBLIC_CURRENCY,
  language: process.env.NEXT_PUBLIC_LANGUAGE ?? 'default',
  stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  email: process.env.NEXT_PUBLIC_USER_EMAIL,
  version: process.env.NEXT_PUBLIC_SETTINGS_VERSION,
  primaryColor: process.env.NEXT_PUBLIC_PRIMARY_COLOR,
  backgroundColor: process.env.NEXT_PUBLIC_BACKGROUND_COLOR,
  customLogo: process.env.NEXT_PUBLIC_CUSTOM_LOGO,
  eceEnabled: true,
  addressEnabled: true,
  metronomeDeliveryMethodId: '',
};

export const defaultCartSettings = {
  items: [],
  shippingMethod: 'standard',
  shippingCost: 0,
  discount: 0,
  isCartOpen: false,
  tax: { amount: 0, inclusive: false },
};

export {
  DEFAULT_METRONOME_CUSTOMER_ID,
  defaultDemoMetronomeCustomerId,
  getEffectiveMetronomeCustomerId,
} from './metronomeDefaults';

/** Pre-filled sign-in password for local demo (email comes from generated/stored demo customer). */
export const defaultDemoSignInPassword = '12345678';
