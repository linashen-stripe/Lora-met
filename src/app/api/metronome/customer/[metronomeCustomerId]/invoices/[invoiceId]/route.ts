import { NextRequest, NextResponse } from 'next/server';
import { initializeMetronome, getCustomerInvoice } from '@/utils/metronome';
import { toJsonSafe } from '@/utils/jsonSafeResponse';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ metronomeCustomerId: string; invoiceId: string }> },
) {
  try {
    const { metronomeCustomerId, invoiceId } = await params;
    let decodedId = invoiceId;
    try {
      decodedId = decodeURIComponent(invoiceId);
    } catch {
      /* keep raw segment */
    }
    if (!invoiceId || invoiceId === 'undefined' || decodedId.trim() === '') {
      return NextResponse.json({ error: 'Invoice id is required' }, { status: 400 });
    }
    const metronome = initializeMetronome(request.headers);
    if (!metronome) {
      return NextResponse.json({ error: 'Metronome not configured' }, { status: 503 });
    }
    const invoice = await getCustomerInvoice(metronome, metronomeCustomerId, decodedId);
    return NextResponse.json(toJsonSafe({ invoice }));
  } catch (error) {
    console.error('Error fetching Metronome invoice:', error);
    return NextResponse.json({ error: 'Failed to fetch invoice' }, { status: 500 });
  }
}
