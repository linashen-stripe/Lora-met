import { NextRequest, NextResponse } from 'next/server';
import initializeStripe from '@/utils/stripe';
import { deleteStripeCustomers, listStripeCustomers } from '@/utils/demoCleanup';
import { ndjsonStreamResponse } from '@/utils/ndjsonStream';
import { DEMO_MODES, normalizeDemoMode } from '@/config/demoModes';

// Step 2 of the /admin/cleanup-environment wizard: list and delete Stripe
// customers. DELETE is irreversible — the client must gate this behind an
// explicit confirmation step.

export async function GET(request: NextRequest) {
  let stripe;
  try {
    stripe = initializeStripe(request.headers);
  } catch {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 400 });
  }
  const { searchParams } = new URL(request.url);
  const rawMode = searchParams.get('demoMode');
  const customers = await listStripeCustomers(stripe);
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

export async function DELETE(request: NextRequest) {
  let stripe;
  try {
    stripe = initializeStripe(request.headers);
  } catch {
    stripe = null;
  }
  const body = await request.json().catch(() => ({}));
  const customerIds: string[] = Array.isArray(body.customerIds) ? body.customerIds : [];

  return ndjsonStreamResponse(async (onLog) => {
    if (!stripe) throw new Error('Stripe not configured');
    if (customerIds.length === 0) throw new Error('customerIds is required');
    return deleteStripeCustomers(stripe, customerIds, onLog);
  });
}
