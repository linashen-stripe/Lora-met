import { NextRequest, NextResponse } from 'next/server';
import initializeStripe from '@/utils/stripe';
import { getStripeCustomerId } from '@/utils/withFallbackHeaders';
import { getOrCreateBillingProfile } from '@/utils/stripe/billingProfile';
import { getOrCreateCadence } from '@/utils/stripe/cadence';

interface RequestBody {
  pricingPlanLookupKey: string;
}

export async function POST(request: NextRequest) {
  try {
    const stripe = initializeStripe(request.headers);

    const { pricingPlanLookupKey }: RequestBody = await request.json();

    const customer = getStripeCustomerId(request.headers);
    if (!customer) {
      return NextResponse.json(
        { error: 'Stripe customer ID is required' },
        { status: 400 },
      );
    }

    const pricingPlans = await stripe.v2.billing.pricingPlans.list({
      lookup_keys: [pricingPlanLookupKey],
      limit: 1,
    });

    const pricingPlan = pricingPlans.data[0];

    if (!pricingPlan) {
      return NextResponse.json(
        { error: 'Pricing plan not found' },
        { status: 404 },
      );
    }

    if (!pricingPlan.live_version) {
      return NextResponse.json(
        { error: 'Pricing plan has no live version' },
        { status: 404 },
      );
    }

    const billingProfile = await getOrCreateBillingProfile(stripe, customer);
    const cadence = await getOrCreateCadence(stripe, customer, billingProfile.id);
    console.log(`✅ Cadence: ${cadence.id}`);

    // Check for an existing active subscription to deactivate (upgrade flow)
    const existingSubs =
      await stripe.v2.billing.pricingPlanSubscriptions.list({
        payer: { type: 'customer', customer },
        servicing_status: 'active',
      });

    const actions: any[] = [];

    if (existingSubs.data.length > 0) {
      const currentSub = existingSubs.data[0];
      console.log(`↗️ Upgrade detected — deactivating ${currentSub.id}`);
      actions.push({
        type: 'deactivate',
        deactivate: {
          type: 'pricing_plan_subscription_details',
          pricing_plan_subscription_details: {
            pricing_plan_subscription: currentSub.id,
          },
        },
      });
    }

    actions.push({
      type: 'subscribe',
      subscribe: {
        type: 'pricing_plan_subscription_details',
        pricing_plan_subscription_details: {
          pricing_plan: pricingPlan.id,
          pricing_plan_version: pricingPlan.live_version,
        },
      },
    });

    const billingIntent = await stripe.v2.billing.intents.create({
      currency: pricingPlan.currency,
      cadence: cadence.id,
      actions,
    });
    console.log(`✅ Billing Intent drafted: ${billingIntent.id}`);

    return NextResponse.json(billingIntent);
  } catch (err) {
    console.error('Error: ', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 },
    );
  }
}
