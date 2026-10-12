'use server';

export const getEnv = async () => ({
  primaryColor: process.env.PRIMARY_COLOR,
  backgroundColor: process.env.BACKGROUND_COLOR,
  customLogo: process.env.CUSTOM_LOGO,
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  language: process.env.LANGUAGE,
  currency: process.env.CURRENCY,
  checkoutMethod: process.env.CHECKOUT_METHOD,
  isDemogen: process.env.IS_DEMOGEN,
  metronomeApiKey: process.env.METRONOME_API_KEY,
  metronomeDeliveryMethodId: process.env.METRONOME_DELIVERY_METHOD_ID,
});
