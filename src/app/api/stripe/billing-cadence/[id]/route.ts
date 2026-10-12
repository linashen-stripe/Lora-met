import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import initializeStripe from '@/utils/stripe';

export type APIBillingCadenceResponse = Stripe.V2.Billing.Cadence;

/**
 * Retrieve a billing cadence for customer
 * @param req - NextRequest object
 * @returns Billing cadence object
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const stripe = initializeStripe(request.headers);
    const { id: billingCadenceId } = await params;

    if (!billingCadenceId) {
      return NextResponse.json(
        { error: 'Billing cadence ID is required.' },
        { status: 400 },
      );
    }

    // Get the billing cadence
    const cadence = await stripe.v2.billing.cadences.retrieve(billingCadenceId);

    return NextResponse.json<APIBillingCadenceResponse>(cadence);
  } catch (err) {
    const error = err as Error;
    console.error('Stripe API Error:', error.message);
    return NextResponse.json(
      { error: 'Failed to fetch billing cadence.' },
      { status: 500 },
    );
  }
}
