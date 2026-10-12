import { NextRequest, NextResponse } from 'next/server';
import { getMetronomeReconciliationSignal } from '@/utils/metronomeReconciliationSignal';

export async function GET(request: NextRequest) {
  const customerId = request.nextUrl.searchParams.get('customer_id')?.trim();
  if (!customerId) {
    return NextResponse.json(
      { error: 'customer_id is required' },
      { status: 400 },
    );
  }

  return NextResponse.json({
    signal: getMetronomeReconciliationSignal(customerId),
  });
}
