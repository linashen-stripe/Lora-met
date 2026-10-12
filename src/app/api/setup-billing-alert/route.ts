import { NextResponse } from 'next/server';
import { setupCreditBalanceAlert } from '@/utils/stripe/alerts';

export async function POST(req: Request) {
  const body = await req.json();
  const { customerId, threshold, currency = 'usd' } = body;

  if (!customerId || threshold === undefined) {
    return NextResponse.json(
      {
        error:
          'Missing required parameters: customerId and threshold must be provided.',
      },
      { status: 400 },
    );
  }

  try {
    console.log(
      `Setting up $${
        threshold / 100
      } credit balance alert for customer: ${customerId}`,
    );
    const alert = await setupCreditBalanceAlert(
      customerId,
      threshold,
      currency,
      req.headers,
    );
    console.log('Successfully created alert:', alert.id);
    return NextResponse.json({
      message: 'Alert creation successful!',
      alertId: alert.id,
    });
  } catch (error: any) {
    console.error('Failed to create alert:', error);
    return NextResponse.json(
      { error: `Failed to create alert: ${error.message}` },
      { status: 500 },
    );
  }
}
