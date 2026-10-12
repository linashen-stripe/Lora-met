import { NextRequest, NextResponse } from 'next/server';

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

  console.log(`[metronome/webhook] Received event type: ${event?.type}, customer: ${event?.properties?.customer_id ?? event?.customer_id}`);

  return NextResponse.json({ received: true });
}
