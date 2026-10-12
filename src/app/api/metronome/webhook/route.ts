import { NextRequest, NextResponse } from 'next/server';
import { recordMetronomeReconciliationSignal } from '@/utils/metronomeReconciliationSignal';

/**
 * POST /api/metronome/webhook
 *
 * Receives Metronome webhook events. Auto top-up is handled natively by
 * Metronome via `credit_balance_threshold_configuration` — no manual commit
 * or invoice creation needed here.
 */
export async function POST(request: NextRequest) {
  let event: any;
  try {
    event = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const customerId =
    event?.properties?.customer_id ??
    event?.customer_id ??
    event?.data?.customer_id ??
    event?.data?.customer?.id;
  const eventType = event?.type ?? null;

  if (typeof customerId === 'string' && customerId.trim()) {
    recordMetronomeReconciliationSignal(customerId, eventType);
  }

  console.log(
    `[metronome/webhook] Received event type: ${eventType}, customer: ${customerId}`,
  );

  return NextResponse.json({ received: true });
}
