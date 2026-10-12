import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import initializeStripe from '@/utils/stripe';

export type APITestClockAdvanceRequestBody =
  | {
      id: string;
      frozenTime: number;
    }
  | {
      id: string;
      advanceBy: number;
    };

export type APITestClockAdvanceResponse = Stripe.TestHelpers.TestClock;

/**
 * Retrieve a test clock object
 * @param req - NextRequest object
 * @returns Test clock object
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const stripe = initializeStripe(request.headers);
    const { id: testClockId, ...rest } =
      (await request.json()) as APITestClockAdvanceRequestBody;

    if (!testClockId) {
      return NextResponse.json(
        { error: 'Test clock ID is required.' },
        { status: 400 },
      );
    }

    if (!('frozenTime' in rest) && !('advanceBy' in rest)) {
      return NextResponse.json(
        { error: 'Either frozenTime or advanceBy is required.' },
        { status: 400 },
      );
    }

    let res: APITestClockAdvanceResponse;

    if ('frozenTime' in rest) {
      const { frozenTime } = rest;
      // Advance the test clock to the given frozen time
      res = await stripe.testHelpers.testClocks.advance(testClockId, {
        frozen_time: frozenTime,
      });
    } else {
      const { advanceBy } = rest;
      // Get the test clock's current time
      const testClock =
        await stripe.testHelpers.testClocks.retrieve(testClockId);
      // Advance the test clock by the given number of seconds
      res = await stripe.testHelpers.testClocks.advance(testClockId, {
        frozen_time: testClock.frozen_time + advanceBy,
      });
    }

    return NextResponse.json<APITestClockAdvanceResponse>(res);
  } catch (err) {
    const error = err as Error;
    console.error('Stripe API Error:', error.message);
    return NextResponse.json(
      { error: 'Failed to fetch test clock.' },
      { status: 500 },
    );
  }
}
