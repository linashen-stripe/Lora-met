import { NextRequest, NextResponse } from 'next/server';
import initializeStripe from '@/utils/stripe';

/**
 * Retrieve the data from a checkout session
 * @param req - NextRequest object
 * @returns Checkout session data
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const stripe = initializeStripe(req.headers);
    const { id: sessionId } = await params;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required.' },
        { status: 400 },
      );
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    return NextResponse.json(session);
  } catch (err) {
    const error = err as Error;
    console.error('Stripe API Error:', error.message);
    return NextResponse.json(
      { error: 'Failed to fetch checkout session.' },
      { status: 500 },
    );
  }
}
