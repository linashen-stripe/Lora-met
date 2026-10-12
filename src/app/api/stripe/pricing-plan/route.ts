import { NextRequest, NextResponse } from 'next/server';
import initializeStripe from '@/utils/stripe';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const stripe = initializeStripe(req.headers);

    const { searchParams } = new URL(req.url);

    // Get lookup keys from query params
    const lookupKeys = searchParams.get('lookup_keys')?.split(',') ?? [];

    // Fetch all active pricing plans
    const plans = await stripe.v2.billing.pricingPlans.list({
      lookup_keys: lookupKeys,
    });

    return NextResponse.json({ plans: plans.data });
  } catch (err) {
    const error = err as Error;
    console.error('Stripe API Error:', error.message);
    return NextResponse.json(
      { error: 'Failed to fetch pricing plans.' },
      { status: 500 },
    );
  }
}
