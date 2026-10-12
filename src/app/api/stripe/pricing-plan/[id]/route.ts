import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import initializeStripe from '@/utils/stripe';
import { getExpandedPricingPlanComponents } from '@/utils/stripe/pricingPlan';

/**
 * Retrieve a pricing plan and its components
 * @param req - NextRequest object
 * @returns Pricing plan object
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const stripe = initializeStripe(req.headers);
    const { id } = await params;

    // Retrieve the pricing plan
    const pricingPlan = await stripe.v2.billing.pricingPlans.retrieve(id);

    if (!pricingPlan) {
      return NextResponse.json(
        { error: 'Pricing plan not found' },
        { status: 404 },
      );
    }

    // Get the expanded components
    const expandedComponents = await getExpandedPricingPlanComponents(stripe, id);

    return NextResponse.json({ pricingPlan, expandedComponents });
  } catch (err) {
    const error = err as Error;
    console.error('Stripe API Error:', error.message);
    return NextResponse.json(
      { error: 'Failed to fetch pricing plans.' },
      { status: 500 },
    );
  }
}
