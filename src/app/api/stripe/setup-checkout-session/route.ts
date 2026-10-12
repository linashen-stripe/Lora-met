import { NextRequest, NextResponse } from 'next/server';
import initializeStripe from '@/utils/stripe';
import { getStripeCustomerId, withFallbackHeaders } from '@/utils/withFallbackHeaders';
import { getStripeLocale } from '@/utils/stripe/localeUtils';

/**
 * Create a Stripe Checkout session in setup mode to collect payment details
 * without creating a subscription. Used by the Metronome package signup flow.
 * Collects billing address and merges it onto the Customer via `customer_update`.
 * (`automatic_tax` is not valid on Checkout in `setup` mode — use the stored address for Tax / Metronome downstream.)
 */
export async function POST(request: NextRequest) {
  try {
    const stripe = initializeStripe(request.headers);
    const { language, currency: currencyFromHeaders } = withFallbackHeaders(request.headers);
    const { settings } = await request.json();

    const stripeCustomerId = getStripeCustomerId(request.headers);
    if (!stripeCustomerId) {
      const allHeaders: Record<string, string> = {};
      request.headers.forEach((v, k) => { allHeaders[k] = k.startsWith('demo-') ? v : '[redacted]'; });
      console.error('[setup-checkout-session] Missing stripeCustomerId. Demo headers:', allHeaders);
      return NextResponse.json(
        { error: 'Stripe customer ID is required (link account or set demo-stripe-customer)' },
        { status: 400 },
      );
    }

    const currency = (
      settings?.currency ||
      currencyFromHeaders ||
      process.env.NEXT_PUBLIC_CURRENCY ||
      'usd'
    )
      .toString()
      .trim()
      .toLowerCase();

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'setup',
      currency,
      ui_mode: 'embedded',
      redirect_on_completion: 'never',
      locale: getStripeLocale(settings?.language || language || 'en'),
      billing_address_collection: 'required',
      customer_update: {
        address: 'auto',
      },
    });

    return NextResponse.json({
      sessionId: session.id,
      clientSecret: session.client_secret,
    });
  } catch (err) {
    console.error('Error creating setup checkout session:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 },
    );
  }
}
