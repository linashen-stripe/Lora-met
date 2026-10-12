import { NextRequest, NextResponse } from 'next/server';
import initializeStripe from '@/utils/stripe';
import { MeterService, UsageRecord } from '@/utils/stripe/MeterService';

interface RequestBody {
  customerId: string;
  data: UsageRecord[];
  useStreaming?: boolean;
}

/**
 * Create new meter events for a customer in bulk
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const stripe = initializeStripe(request.headers);
    const meterService = new MeterService(stripe);

    const { customerId, data, useStreaming }: RequestBody =
      await request.json();

    // Validate input
    if (!customerId || !data) {
      return NextResponse.json(
        { error: 'Customer ID and data are all required' },
        { status: 400 },
      );
    }

    await meterService.sendBulkMeterEvents(customerId, data, useStreaming);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error: ', error);
    return NextResponse.json(
      { error: 'An internal server error occurred' },
      { status: 500 },
    );
  }
}
