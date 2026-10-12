import { NextRequest, NextResponse } from 'next/server';
import { initializeMetronome } from '@/utils/metronome';

interface IngestEvent {
  transactionId: string;
  customerId: string;
  eventType: string;
  timestamp: string;
  properties: Record<string, string | number>;
}

export async function POST(request: NextRequest) {
  try {
    const metronome = initializeMetronome(request.headers);
    if (!metronome) {
      return NextResponse.json(
        { message: 'Metronome API key is not set.' },
        { status: 503 },
      );
    }

    const { events }: { events: IngestEvent[] } = await request.json();

    if (!events || events.length === 0) {
      return NextResponse.json({ message: 'No events provided' }, { status: 400 });
    }

    const payload = events.map((e) => ({
      transaction_id: e.transactionId,
      customer_id: e.customerId,
      event_type: e.eventType,
      timestamp: e.timestamp,
      properties: e.properties,
    }));

    console.log(`[ingest] sending ${payload.length} events to Metronome:`);
    payload.forEach((e) => console.log(`  →`, JSON.stringify(e)));

    await metronome.v1.usage.ingest({ usage: payload });

    return NextResponse.json({ ok: true, count: events.length });
  } catch (error) {
    console.error('Metronome ingest error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
