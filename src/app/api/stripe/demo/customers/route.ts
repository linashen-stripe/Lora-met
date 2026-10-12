import { NextRequest, NextResponse } from 'next/server';
import initializeStripe from '@/utils/stripe';
import { deleteStripeCustomers, listStripeCustomers } from '@/utils/demoCleanup';
import { ndjsonStreamResponse } from '@/utils/ndjsonStream';

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
  const customers = await listStripeCustomers(stripe);
  return NextResponse.json({ customers });
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
