import initializeStripe from '@/utils/stripe';
import { NextResponse } from 'next/server';
import { CreditService } from '@/utils/stripe/CreditService';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: customerId } = await params;

  if (!customerId) {
    return NextResponse.json(
      { error: 'Customer ID is required' },
      { status: 400 },
    );
  }

  try {
    const stripe = initializeStripe(request.headers);
    const creditService = new CreditService(stripe);

    const outstandingBalance =
      await creditService.getOutstandingBalance(customerId);

    return NextResponse.json(outstandingBalance);
  } catch (error: any) {
    console.error('Error fetching outstanding balance:', error);
    return NextResponse.json(
      { error: error.message || 'Error fetching outstanding balance' },
      { status: 500 },
    );
  }
}
