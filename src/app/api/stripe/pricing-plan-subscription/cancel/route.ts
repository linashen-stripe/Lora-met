import { NextRequest, NextResponse } from 'next/server';
import initializeStripe from '@/utils/stripe';
import { SubscriptionManagementService } from '@/utils/stripe/SubscriptionManagementService';

type RequestBody = {
  customerId: string;
  pricingPlanSubscriptionId: string;
  billingCadenceId: string;
  enableAutomaticReenrollment: boolean;
};

// Cancel a customer's subscription to a pricing plan
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const {
      customerId,
      pricingPlanSubscriptionId,
      billingCadenceId,
      enableAutomaticReenrollment,
    }: RequestBody = await req.json();

    if (!customerId) {
      return NextResponse.json(
        { message: 'Missing customer ID' },
        { status: 400 },
      );
    }

    if (!pricingPlanSubscriptionId) {
      return NextResponse.json(
        { message: 'Missing pricingPlanSubscriptionId' },
        { status: 400 },
      );
    }

    if (!billingCadenceId) {
      return NextResponse.json(
        { message: 'Missing billingCadenceId' },
        { status: 400 },
      );
    }

    const stripe = initializeStripe(req.headers);
    const subscriptionService = new SubscriptionManagementService(stripe);

    // Use the service to cancel the subscription
    const result = await subscriptionService.cancelSubscription({
      customerId,
      pricingPlanSubscriptionId,
      billingCadenceId,
      enableAutomaticReenrollment,
    });

    return NextResponse.json(
      {
        message: 'Customer subscription cancelled successfully!',
      },
      { status: 200 },
    );
  } catch (err) {
    const error = err as Error;
    console.error('API Error:', error.message);
    return NextResponse.json(
      { message: 'Error cancelling subscription.', error: error.message },
      { status: 500 },
    );
  }
}
