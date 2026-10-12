import { NextRequest, NextResponse } from 'next/server';
import {
  initializeMetronome,
  getStripeCustomerIdFromMetronomeCustomer,
  resolveMetronomeDeliveryMethodId,
} from '@/utils/metronome';
import { DEFAULT_METRONOME_CUSTOMER_ID } from '@/config/metronomeDefaults';
import initializeStripe from '@/utils/stripe';
import { withFallbackHeaders } from '@/utils/withFallbackHeaders';

type RequestBody = {
  email: string;
};

/**
 * Sign in by looking up a Metronome customer by email (ingest alias).
 * Falls back to the default demo customer if no match is found.
 * If the customer has no linked Stripe customer, one is created and linked.
 */
export async function POST(request: NextRequest) {
  try {
    const metronome = initializeMetronome(request.headers);
    if (!metronome) {
      return NextResponse.json(
        { message: 'Metronome API key is not set. Add METRONOME_API_KEY to .env or enter it in the Tools panel.' },
        { status: 503 },
      );
    }

    const body: RequestBody = await request.json();
    if (!body.email) {
      return NextResponse.json({ message: 'Missing email' }, { status: 400 });
    }

    const result = await metronome.v1.customers.list({ ingest_alias: body.email });
    const customer = result.data[0];

    const metronomeCustomerId = customer?.id ?? DEFAULT_METRONOME_CUSTOMER_ID;
    const name = customer?.name ?? 'Acme Co';

    let stripeCustomerId: string | undefined;
    try {
      // Try to get the linked Stripe customer — may throw 404 for brand-new customers.
      const resolved = await getStripeCustomerIdFromMetronomeCustomer(metronome, metronomeCustomerId).catch(() => null);
      stripeCustomerId = resolved ?? undefined;
    } catch {
      // ignore
    }

    // If no Stripe customer found, find or create one and link it to the Metronome customer.
    if (!stripeCustomerId) {
      try {
        const stripe = initializeStripe(request.headers);
        const { metronomeDeliveryMethodId } = withFallbackHeaders(request.headers);
        const deliveryMethodId = resolveMetronomeDeliveryMethodId(metronomeDeliveryMethodId);
        if (stripe && deliveryMethodId) {
          // Search for existing Stripe customer by email before creating a new one.
          const existing = await stripe.customers.search({ query: `email:'${body.email}'`, limit: 1 });
          const stripeCustomer = existing.data[0] ?? await stripe.customers.create({ email: body.email, name });
          stripeCustomerId = stripeCustomer.id;
          console.log(`[sign-in] Linking Stripe customer ${stripeCustomerId} to Metronome customer ${metronomeCustomerId} via delivery method ${deliveryMethodId}`);
          await metronome.v1.customers.setBillingConfigurations({
            data: [
              {
                customer_id: metronomeCustomerId,
                billing_provider: 'stripe',
                delivery_method_id: deliveryMethodId,
                configuration: {
                  stripe_customer_id: stripeCustomerId,
                  stripe_collection_method: 'charge_automatically',
                  tax_provider: 'stripe',
                } as any,
              },
            ],
          });
        }
          console.log(`[sign-in] Successfully linked Stripe customer ${stripeCustomerId} to Metronome customer ${metronomeCustomerId}`);
      } catch (err) {
        console.warn('[sign-in] Could not create/link Stripe customer:', err);
      }
    }

    return NextResponse.json({ metronomeCustomerId, name, stripeCustomerId });
  } catch (error) {
    console.error('Sign-in error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
