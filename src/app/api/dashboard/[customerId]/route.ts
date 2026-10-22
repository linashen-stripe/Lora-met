import { NextRequest, NextResponse } from 'next/server';
import { buildMetronomeForwardDashboard } from '@/utils/metronomeDashboardFallback';
import { getStripeCustomerId } from '@/utils/withFallbackHeaders';

/**
 * Dashboard bundle for this Metronome-first app. Returns a contract-style
 * snapshot plus the linked Stripe Customer used for payment methods.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ customerId: string }> },
): Promise<NextResponse> {
  try {
    const { customerId } = await params;

    if (!customerId) {
      return NextResponse.json(
        { error: 'Customer ID is required.' },
        { status: 400 },
      );
    }

    const metronomeCustomerId =
      req.nextUrl.searchParams.get('mc')?.trim() ?? null;

    if (!metronomeCustomerId) {
      return NextResponse.json(
        {
          error: 'Failed to fetch dashboard data.',
          details: 'A Metronome customer id is required in query parameter `mc`.',
        },
        { status: 400 },
      );
    }

    const stripeCustomerIdForPayment =
      getStripeCustomerId(req.headers) ||
      (customerId.startsWith('cus_') ? customerId : null);

    const dashboardData = await buildMetronomeForwardDashboard(
      req.headers,
      metronomeCustomerId,
      stripeCustomerIdForPayment,
    );
    return NextResponse.json(dashboardData);
  } catch (err) {
    const error = err as Error;
    console.error('Dashboard API Error:', error.message);
    console.error('Full error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data.', details: error.message },
      { status: 500 },
    );
  }
}
