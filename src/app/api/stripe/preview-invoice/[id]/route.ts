import { NextRequest, NextResponse } from 'next/server';
import initializeStripe from '@/utils/stripe';
import { InvoiceService } from '@/utils/stripe/InvoiceService';

/**
 * Retrieve a preview invoice for customer
 * @param req - NextRequest object
 * @returns Pricing plan object
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const stripe = initializeStripe(req.headers);
    const invoiceService = new InvoiceService(stripe);
    const { id: billingCadenceId } = await params;

    if (!billingCadenceId) {
      return NextResponse.json(
        { error: 'Billing cadence ID is required.' },
        { status: 400 },
      );
    }

    const invoice = await invoiceService.getPreview(billingCadenceId);

    return NextResponse.json(invoice);
  } catch (err) {
    const error = err as Error;
    console.error('Stripe API Error:', error.message);
    return NextResponse.json(
      { error: 'Failed to fetch preview invoice.' },
      { status: 500 },
    );
  }
}
