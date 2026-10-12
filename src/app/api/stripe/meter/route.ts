import { NextRequest, NextResponse } from 'next/server';
import initializeStripe from '@/utils/stripe';
import { MeterService } from '@/utils/stripe/MeterService';

/**
 * Retrieve active meters from Stripe
 * @param request - NextRequest object
 * @returns List of active meters or error message
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const stripe = initializeStripe(request.headers);
    const meterService = new MeterService(stripe);

    const meters = await meterService.getMeters();

    // Check if any active meters were found
    if (!meters.length) {
      return NextResponse.json(
        { error: 'No active meters found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ meters });
  } catch (error) {
    console.error('Error retrieving meters:', error);
    return NextResponse.json(
      { error: 'An internal server error occurred' },
      { status: 500 },
    );
  }
}
