import { NextRequest, NextResponse } from 'next/server';
import initializeStripe from '@/utils/stripe';
import { getStripeCustomerId } from '@/utils/withFallbackHeaders';
import Stripe from 'stripe';

/**
 * Retrieve meter event summaries for a customer over the last 30 days
 * @param request - NextRequest object
 * @param params - Object containing the meter ID
 * @returns List of meter event summaries
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const stripe = initializeStripe(request.headers);
    const { id: meterId } = await params;
    const { searchParams } = new URL(request.url);

    const customerId =
      getStripeCustomerId(request.headers) || searchParams.get('customerId') || undefined;

    if (!meterId) {
      return NextResponse.json(
        { error: 'Meter ID is required' },
        { status: 400 },
      );
    }

    if (!customerId) {
      return NextResponse.json(
        { error: 'Stripe customer ID is required' },
        { status: 400 },
      );
    }

    // Parse applicable filters if they exist
    const dimensions = Array.from(searchParams.entries()).reduce(
      (acc, [key, value]) => {
        if (key.startsWith('d.')) {
          acc[key.slice(2)] = value;
        }
        return acc;
      },
      {} as { [key: string]: string },
    );

    const now = Math.floor(Date.now() / 1000);
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60; // 30 days ago

    const startTimeParam = searchParams.get('start_time');
    const endTimeParam = searchParams.get('end_time');
    const groupByDay = searchParams.get('grouped') !== 'false';

    const startTime = startTimeParam
      ? parseInt(startTimeParam, 10)
      : thirtyDaysAgo;
    const endTime = endTimeParam ? parseInt(endTimeParam, 10) : now;

    const listOptions: Stripe.Billing.MeterListEventSummariesParams = {
      customer: customerId,
      start_time: startTime,
      end_time: endTime,
      ...(Object.keys(dimensions).length > 0
        ? { dimension_filters: dimensions }
        : {}),
    };

    if (groupByDay) {
      listOptions.value_grouping_window = 'day';
    }

    const meterEventSummaries = await stripe.billing.meters.listEventSummaries(
      meterId,
      listOptions,
    );

    return NextResponse.json(meterEventSummaries);
  } catch (error: any) {
    console.error('Error fetching meter event summaries:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
