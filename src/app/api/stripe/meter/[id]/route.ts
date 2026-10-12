import { NextRequest, NextResponse } from 'next/server';
import initializeStripe from '@/utils/stripe';

interface RequestBody {
  customerId: string;
  startRange?: number;
  endRange?: number;
  amount?: number;
  dimensions?: Record<string, string>;
}

/**
 * Retrieve meter event summaries for a customer
 * @param request - NextRequest object containing customerId and startRange
 * @param params - Object containing the meter ID
 * @returns List of meter event summaries
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const stripe = initializeStripe(request.headers);
    const { customerId, startRange, endRange }: RequestBody =
      await request.json();
    const { id } = await params;

    // Validate input
    if (!id || !customerId || !startRange || !endRange) {
      return NextResponse.json(
        { error: 'Customer ID, Meter ID, and start range are all required' },
        { status: 400 },
      );
    }

    // Fetch meter event summaries
    const meterSummary = await stripe.billing.meters.listEventSummaries(id, {
      customer: customerId,
      start_time: startRange,
      end_time: endRange,
    });

    return NextResponse.json({ meters: meterSummary.data });
  } catch (error) {
    console.error('Error: ', error);
    return NextResponse.json(
      { error: 'An internal server error occurred' },
      { status: 500 },
    );
  }
}

/**
 * Create a new meter event for a customer
 * @param request - NextRequest object containing customerId and amount
 * @param params - Object containing the meter ID
 * @returns Created meter event
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const stripe = initializeStripe(request.headers);
    const { customerId, amount, dimensions }: RequestBody =
      await request.json();
    const { id } = await params;

    // Validate input
    if (!id || !customerId || typeof amount !== 'number') {
      return NextResponse.json(
        { error: 'Customer ID, Meter ID, and amount are all required' },
        { status: 400 },
      );
    }

    // Create a new meter event
    const event = await stripe.v2.billing.meterEvents.create({
      event_name: id,
      payload: {
        value: amount.toString(),
        stripe_customer_id: customerId,
        ...(dimensions ?? {}),
      },
    });

    return NextResponse.json({ event });
  } catch (error) {
    console.error('Error: ', error);
    return NextResponse.json(
      { error: 'An internal server error occurred' },
      { status: 500 },
    );
  }
}
