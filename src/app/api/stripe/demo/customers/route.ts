import { NextRequest, NextResponse } from 'next/server';
import initializeStripe from '@/utils/stripe';
import { deleteStripeCustomers, listStripeCustomers } from '@/utils/demoCleanup';
import { ndjsonStreamResponse } from '@/utils/ndjsonStream';
import { normalizeDemoMode } from '@/config/demoModes';
import { hasDemoCustomerNamePrefix } from '@/utils/demoCustomerName';

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
  const normalizedMode =
    rawMode && rawMode !== 'all' ? normalizeDemoMode(rawMode) : null;
  const searchQueries =
    rawMode === 'all'
      ? [
          "name~'Lora Generate'",
          "name~'Generate -'",
          "name~'AI Builder'",
          "metadata['starter_namespace']:'metronome-starter'",
        ]
      : normalizedMode === 'generation'
        ? [
            "name~'Lora Generate'",
            "name~'Generate -'",
            "metadata['starter_namespace']:'metronome-starter'",
          ]
        : normalizedMode === 'ai-builder'
          ? ["name~'AI Builder'"]
          : [];
  const customers = await listStripeCustomers(stripe, searchQueries);
  const filteredCustomers = rawMode
    ? customers.filter((customer) =>
        rawMode === 'all'
          ? customer.metadata.starter_namespace === 'metronome-starter' ||
            (['generation', 'ai-builder'] as const).some((mode) =>
              hasDemoCustomerNamePrefix(customer.name, mode),
            )
          : hasDemoCustomerNamePrefix(customer.name, normalizedMode!) ||
            (normalizedMode === 'generation' &&
              customer.metadata.starter_namespace === 'metronome-starter'),
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
