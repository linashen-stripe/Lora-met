import { NextRequest, NextResponse } from 'next/server';
import { DashboardService } from '@/utils/stripe/DashboardService';
import { buildMetronomeForwardDashboard } from '@/utils/metronomeDashboardFallback';
import { getStripeCustomerId } from '@/utils/withFallbackHeaders';
import type { UnifiedDashboardData } from '@/utils/types';

/**
 * Dashboard bundle for this Metronome-first app:
 * - With `mc` (Metronome customer id): returns contract-style snapshot + linked Stripe
 *   **Customer** only (default payment method for invoicing). No Stripe Billing V2
 *   subscriptions, preview invoice, or cadence aggregation.
 * - Without `mc`: legacy Stripe Billing dashboard (demo / tooling only).
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

    if (metronomeCustomerId) {
      const stripeCustomerIdForPayment =
        getStripeCustomerId(req.headers) ||
        (customerId.startsWith('cus_') ? customerId : null);

      const dashboardData = await buildMetronomeForwardDashboard(
        req.headers,
        metronomeCustomerId,
        stripeCustomerIdForPayment,
      );
      return NextResponse.json(dashboardData);
    }

    const dashboardService = new DashboardService(req.headers);

    const stripeCustomerIdForBilling =
      getStripeCustomerId(req.headers) ||
      (customerId.startsWith('cus_') ? customerId : null);

    if (!stripeCustomerIdForBilling) {
      return NextResponse.json(
        {
          error: 'Failed to fetch dashboard data.',
          details:
            'Without query parameter `mc`, a Stripe customer id is required: set `demo-stripe-customer` to your `cus_…` id or use a `cus_…` path segment.',
        },
        { status: 400 },
      );
    }

    const includeUsageData =
      req.nextUrl.searchParams.get('includeUsage') === 'true';

    const dashboardData: UnifiedDashboardData =
      await dashboardService.getUnifiedDashboardData(
        stripeCustomerIdForBilling,
        includeUsageData,
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
