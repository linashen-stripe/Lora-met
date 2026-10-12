import { NextRequest, NextResponse } from 'next/server';
import { initializeMetronome } from '@/utils/metronome';
import {
  SEED_USAGE_MULTI_PROJECT_IDS,
  SEED_USAGE_MULTI_PROJECT_SPEND_SHARES,
  seedMetronomeUsage,
  type SeedStory,
} from '@/utils/metronomeSeedUsage';
import { DEMO_METRONOME_USAGE_USER_IDS } from '@/config/demoMetronomeUsageSeats';

// Seed realistic multi-product, multi-model, multi-project usage for a Metronome customer
// with per-seat user_id attribution. One seat is seeded as the heavy user (over their
// per-seat allocation); the remaining seats get clearly distinct, lower amounts.
// Intended for manual use via the Tools → Seeding tab.
//
// Usage: GET /api/metronome/seed-usage-multi-seat?customerId=<id>&contractId=<id>
// Optional:
//   &story=at-risk       (default: healthy)
//   &spendCap=0.45       — fraction of commitment pool to simulate (default 0.42)

export async function GET(request: NextRequest) {
  const metronome = initializeMetronome(request.headers);
  if (!metronome) {
    return NextResponse.json({ error: 'Metronome not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get('customerId');
  const contractId = searchParams.get('contractId')?.trim() || undefined;
  const story = (searchParams.get('story') ?? 'healthy') as SeedStory;
  const spendCapRaw = searchParams.get('spendCap');
  let commitmentSpendCapFraction: number | undefined;
  if (spendCapRaw != null && spendCapRaw !== '') {
    const v = parseFloat(spendCapRaw);
    if (Number.isFinite(v)) commitmentSpendCapFraction = v;
  }

  if (!customerId) {
    return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
  }

  const projects = SEED_USAGE_MULTI_PROJECT_IDS.map((projectId, i) => ({
    projectId,
    spendShare: SEED_USAGE_MULTI_PROJECT_SPEND_SHARES[i] ?? 0,
  }));

  const result = await seedMetronomeUsage({
    metronome,
    customerId,
    story,
    logLabel: '[seed-usage-multi-seat]',
    contractId,
    commitmentSpendCapFraction,
    projectAttribution: { mode: 'multi', projects },
    transactionIdPrefix: 'seed-mp',
    usageUserIds: [...DEMO_METRONOME_USAGE_USER_IDS],
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  }

  return NextResponse.json({
    ok: result.ok,
    story: result.story,
    daysSeeded: result.daysSeeded,
    eventsIngested: result.eventsIngested,
    estimatedSpendDollars: result.estimatedSpendDollars,
    currency: result.currency,
    products: result.products,
    models: result.models,
    usedContractId: result.usedContractId,
    usedRateCardSource: result.usedRateCardSource,
    message: result.message,
    ...(result.projectIds ? { projectIds: result.projectIds } : {}),
  });
}
