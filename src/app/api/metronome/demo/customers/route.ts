import { NextRequest, NextResponse } from 'next/server';
import { initializeMetronome } from '@/utils/metronome';
import { archiveMetronomeCustomers, listActiveMetronomeCustomers } from '@/utils/demoCleanup';
import { ndjsonStreamResponse } from '@/utils/ndjsonStream';
import { DEMO_MODES, normalizeDemoMode } from '@/config/demoModes';

// Step 1 of the /admin/cleanup-environment wizard: list and archive Metronome
// customers. This route only ever calls the archive endpoint — never delete,
// never touches contracts/billing configs directly.

export async function GET(request: NextRequest) {
  const metronome = initializeMetronome(request.headers);
  if (!metronome) {
    return NextResponse.json({ error: 'Metronome not configured' }, { status: 400 });
  }
  const { searchParams } = new URL(request.url);
  const rawMode = searchParams.get('demoMode');
  const customers = await listActiveMetronomeCustomers(metronome);
  const filteredCustomers = rawMode
    ? customers.filter((customer) =>
        rawMode === 'all'
          ? Object.values(DEMO_MODES).some((mode) =>
              customer.name?.startsWith(`[${mode.label}]`),
            )
          : customer.name?.startsWith(
              `[${DEMO_MODES[normalizeDemoMode(rawMode)].label}]`,
            ),
      )
    : customers;
  return NextResponse.json({ customers: filteredCustomers });
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
