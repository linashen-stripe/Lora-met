import { NextRequest, NextResponse } from 'next/server';
import initializeStripe from '@/utils/stripe';
import { getStripeLocale } from '@/utils/stripe/localeUtils';
import { getPublicOriginFromRequest } from '@/utils/getPublicOriginFromRequest';

interface PostRequestBody {
  customerId: string;
  setupIntent?: string;
  intent?: string;
}

/**
 * Create a Stripe Billing Portal session or a Setup Intent
 * @param request - NextRequest object containing mode, customerId, and language
 * @returns URL for Stripe Billing Portal or client secret for Setup Intent
 */
export async function GET(request: NextRequest) {
  const stripe = initializeStripe(request.headers);
  const { searchParams } = new URL(request.url);
  const baseUrl = getPublicOriginFromRequest(request);
  const mode = searchParams.get('mode');
  const customerId = searchParams.get('customerId');
  const language = searchParams.get('language') ?? 'en';

  if (!customerId) {
    return NextResponse.json({ error: 'Missing customer ID' }, { status: 400 });
  }

  try {
    if (mode === 'stripe-checkout') {
      // Create Stripe Billing Portal session
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        locale: getStripeLocale(language),
        return_url: `${baseUrl}/${language}/settings`,
      });

      return NextResponse.json({ url: session.url });
    }

    // Create Setup Intent
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      usage: 'off_session',
    });

    return NextResponse.json({ clientSecret: setupIntent.client_secret });
  } catch (error) {
    console.error('Error: ', error);
    return NextResponse.json(
      { error: 'An internal server error occurred' },
      { status: 500 },
    );
  }
}

/**
 * Update customer's default payment method
 * @param request - NextRequest object containing customerId and either setupIntent or paymentIntent
 * @returns Success status or error message
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const stripe = initializeStripe(request.headers);
    const { customerId, intent }: PostRequestBody = await request.json();

    // External payment methods can't actually be "saved"
    if (intent?.startsWith('external')) {
      return NextResponse.json({ success: true });
    }

    // Validate input
    if (!customerId || !intent) {
      return NextResponse.json(
        {
          error:
            'Customer ID and either setupIntent or paymentIntent are required',
        },
        { status: 400 },
      );
    }

    // Retrieve and validate customer
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 },
      );
    }

    // Retrieve new payment method
    const paymentMethod = intent.startsWith('seti')
      ? (await stripe.setupIntents.retrieve(intent)).payment_method
      : (await stripe.paymentIntents.retrieve(intent)).payment_method;

    // Detach existing default payment method if exists
    if (customer.invoice_settings.default_payment_method) {
      if (customer.invoice_settings.default_payment_method === paymentMethod) {
        return NextResponse.json({ success: true });
      }
      await stripe.paymentMethods.detach(
        customer.invoice_settings.default_payment_method as string,
      );
    }

    // Attach new payment method and set as default
    if (typeof paymentMethod === 'string') {
      await stripe.paymentMethods.attach(paymentMethod, {
        customer: customerId,
      });
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethod },
      });
    } else {
      return NextResponse.json(
        { error: 'Invalid payment method' },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error: ', error);
    return NextResponse.json(
      { error: 'An internal server error occurred' },
      { status: 500 },
    );
  }
}
