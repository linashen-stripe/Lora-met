import initializeStripe from '@/utils/stripe';
import { NextResponse } from 'next/server';
import { InvoiceService } from '@/utils/stripe/InvoiceService';

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
    const invoiceService = new InvoiceService(stripe);

    const invoices = await invoiceService.getCustomerInvoices(customerId);

    return NextResponse.json(invoices);
  } catch (error: any) {
    console.error('Error fetching customer invoices:', error);
    return NextResponse.json(
      { error: error.message || 'Error fetching customer invoices' },
      { status: 500 },
    );
  }
}
