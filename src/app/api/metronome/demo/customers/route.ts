import { NextRequest, NextResponse } from 'next/server';
import { initializeMetronome } from '@/utils/metronome';
import { archiveMetronomeCustomers, listActiveMetronomeCustomers } from '@/utils/demoCleanup';
import { ndjsonStreamResponse } from '@/utils/ndjsonStream';

// Step 1 of the /admin/cleanup-environment wizard: list and archive Metronome
// customers. This route only ever calls the archive endpoint — never delete,
// never touches contracts/billing configs directly.

export async function GET(request: NextRequest) {
  const metronome = initializeMetronome(request.headers);
  if (!metronome) {
    return NextResponse.json({ error: 'Metronome not configured' }, { status: 400 });
  }
  const customers = await listActiveMetronomeCustomers(metronome);
  return NextResponse.json({ customers });
}

export async function POST(request: NextRequest) {
  const metronome = initializeMetronome(request.headers);
  const body = await request.json().catch(() => ({}));
  const customerIds: string[] = Array.isArray(body.customerIds) ? body.customerIds : [];

  return ndjsonStreamResponse(async (onLog) => {
    if (!metronome) throw new Error('Metronome not configured');
    if (customerIds.length === 0) throw new Error('customerIds is required');
    return archiveMetronomeCustomers(metronome, customerIds, onLog);
  });
}
