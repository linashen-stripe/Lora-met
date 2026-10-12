import { NextRequest, NextResponse } from 'next/server';
import initializeStripe from '@/utils/stripe';
import {
  initializeMetronome,
  createMetronomeCustomer,
  getStripeCustomerIdFromMetronomeCustomer,
  resolveMetronomeDeliveryMethodId,
} from '@/utils/metronome';
import { withFallbackHeaders } from '@/utils/withFallbackHeaders';
import { deriveCustomerNameFromEmail } from '@/utils/helpers';

type RequestBody = {
  email?: string;
  name?: string;
};

/** Loads the prepared customer by email, or creates it during demo preparation. */
export async function POST(request: NextRequest) {
  const metronome = initializeMetronome(request.headers);
  let stripe;
  try {
    stripe = initializeStripe(request.headers);
  } catch {
    stripe = null;
  }

  if (!metronome) {
    return NextResponse.json(
      { message: 'Metronome API key is not set. Add it in .env or the Tools panel.' },
      { status: 503 },
    );
  }
  if (!stripe) {
    return NextResponse.json(
      { message: 'Stripe is not configured. Add keys in .env or the Tools panel.' },
      { status: 503 },
    );
  }

  const body: RequestBody = await request.json();
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const name =
    typeof body.name === 'string' && body.name.trim()
      ? body.name.trim()
      : deriveCustomerNameFromEmail(email);

  if (!email) {
    return NextResponse.json({ message: 'Email is required' }, { status: 400 });
  }

  const { metronomeDeliveryMethodId } = withFallbackHeaders(request.headers);

  let stripeCustomerId: string | undefined;

  try {
    const existingCustomers = await metronome.v1.customers.list({
      ingest_alias: email,
    });
    const existingCustomer = existingCustomers.data[0];

    if (existingCustomer) {
      stripeCustomerId =
        (await getStripeCustomerIdFromMetronomeCustomer(
          metronome,
          existingCustomer.id,
        ).catch(() => null)) ?? undefined;

      if (!stripeCustomerId) {
        const stripeCustomer = await stripe.customers.create({ email, name });
        stripeCustomerId = stripeCustomer.id;
        const deliveryMethodId = resolveMetronomeDeliveryMethodId(
          metronomeDeliveryMethodId,
        );
        await metronome.v1.customers.setBillingConfigurations({
          data: [
            {
              customer_id: existingCustomer.id,
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

      const activeContracts = await metronome.v2.contracts.list({
        customer_id: existingCustomer.id,
        covering_date: new Date().toISOString(),
      });

      return NextResponse.json({
        metronomeCustomerId: existingCustomer.id,
        stripeCustomerId,
        name: existingCustomer.name ?? name,
        existing: true,
        hasActiveContract: (activeContracts.data ?? []).length > 0,
      });
    }

    const stripeCustomer = await stripe.customers.create({ email, name });
    stripeCustomerId = stripeCustomer.id;

    try {
      const metronomeCustomerId = await createMetronomeCustomer(metronome, {
        name,
        ingestAliases: [email],
        stripeCustomerId,
        deliveryMethodId: metronomeDeliveryMethodId,
      });

      return NextResponse.json({
        metronomeCustomerId,
        stripeCustomerId,
        name,
        existing: false,
        hasActiveContract: false,
      });
    } catch (createErr: any) {
      if (createErr?.status === 409 && stripeCustomerId) {
        try {
          await stripe.customers.del(stripeCustomerId);
        } catch (delErr) {
          console.warn('[auth/quickstart] could not remove orphan Stripe customer:', delErr);
        }
        return NextResponse.json(
          {
            message:
              'That email already exists but could not be loaded. Retry after refreshing the customer list.',
          },
          { status: 409 },
        );
      }
      throw createErr;
    }
  } catch (err: any) {
    console.error('[auth/quickstart]', err);
    return NextResponse.json(
      { message: err?.message ?? 'Failed to create customers for quickstart' },
      { status: typeof err?.status === 'number' ? err.status : 500 },
    );
  }
}
