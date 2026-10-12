import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import initializeStripe from '@/utils/stripe';

export type APITestClockResponse = Stripe.TestHelpers.TestClock;

/**
 * Retrieve a test clock object
 * @param req - NextRequest object
 * @returns Test clock object
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const stripe = initializeStripe(request.headers);
    const { id: testClockId } = await params;

    if (!testClockId) {
      return NextResponse.json(
        { error: 'Test clock ID is required.' },
        { status: 400 },
      );
    }

    // Get the billing cadence
    const testClock = await stripe.testHelpers.testClocks.retrieve(testClockId);

    return NextResponse.json<APITestClockResponse>(testClock);
  } catch (err) {
    const error = err as Error;
    console.error('Stripe API Error:', error.message);
    return NextResponse.json(
      { error: 'Failed to fetch test clock.' },
      { status: 500 },
    );
  }
}
