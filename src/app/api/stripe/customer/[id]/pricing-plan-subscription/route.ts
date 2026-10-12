import initializeStripe from '@/utils/stripe';
import { NextRequest, NextResponse } from 'next/server';
import { SubscriptionService } from '@/utils/stripe/SubscriptionService';
import { InvoiceService } from '@/utils/stripe/InvoiceService';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const stripe = initializeStripe(req.headers);
    const subscriptionService = new SubscriptionService(stripe);
    const invoiceService = new InvoiceService(stripe);
    const { id: customerId } = await params;

    if (!customerId) {
      return NextResponse.json(
        { error: 'Customer ID is required' },
        { status: 400 },
      );
    }

    try {
      const subscriptionData =
        await subscriptionService.getPricingPlanSubscription(customerId);

      // Get customer details
      const customer = await stripe.customers.retrieve(customerId, {
        expand: ['invoice_settings.default_payment_method'],
      });

      // Get invoice history using the invoice service
      const invoice_history =
        await invoiceService.getCustomerInvoices(customerId);

      // Return the enriched data
      return NextResponse.json({
        subscription: {
          ...subscriptionData.subscription,
          customer,
        },
        pricing_plan: subscriptionData.pricing_plan,
        invoice_history,
      });
    } catch (subscriptionError) {
      return NextResponse.json(
        {
          error: 'No pricing plan subscription found',
          subscription: null,
        },
        { status: 200 },
      );
    }
  } catch (error) {
    console.error('Stripe API error:', error);
    return NextResponse.json(
      { error: 'Error fetching pricing plan subscription' },
      { status: 500 },
    );
  }
}
