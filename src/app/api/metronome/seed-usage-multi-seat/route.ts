import { NextRequest, NextResponse } from 'next/server';
import { initializeMetronome } from '@/utils/metronome';
import {
  AI_BUILDER_SEED_EVENT_REVISION,
  SEED_USAGE_MULTI_PROJECT_IDS,
  SEED_USAGE_MULTI_PROJECT_SPEND_SHARES,
  seedMetronomeUsage,
  type SeedStory,
} from '@/utils/metronomeSeedUsage';

// Seed realistic multi-product, multi-model usage for one prepared AI Builder
// Pro or Quickstart actor. B2B is deliberately excluded: its five explicit
// per-seat targets are seeded once by /demo/power-user at customer creation.
//
// Usage: GET /api/metronome/seed-usage-multi-seat?customerId=<id>&persona=pro
// Optional:
//   &story=at-risk|burst (default: healthy)
//   &spendCap=0.45       — advanced override for the persona/profile target

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
  const trailingDaysRaw = searchParams.get('trailingDays');
  const persona = searchParams.get('persona');
  let commitmentSpendCapFraction: number | undefined;
  let trailingUnseededDays: number | undefined;
  if (spendCapRaw != null && spendCapRaw !== '') {
    const v = parseFloat(spendCapRaw);
    if (Number.isFinite(v)) commitmentSpendCapFraction = v;
  }
  if (trailingDaysRaw != null && trailingDaysRaw !== '') {
    const value = parseInt(trailingDaysRaw, 10);
    if (Number.isFinite(value) && value >= 0) {
      trailingUnseededDays = value;
    }
  }

  if (!customerId) {
    return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
  }
  if (!['healthy', 'at-risk', 'burst'].includes(story)) {
    return NextResponse.json({ error: 'Invalid seed story' }, { status: 400 });
  }
  if (!persona || !['pro', 'quickstart'].includes(persona)) {
    return NextResponse.json(
      {
        error:
          'A non-B2B persona (pro or quickstart) is required. B2B usage is seeded once at customer creation with explicit per-seat targets.',
      },
      { status: 400 },
    );
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
    trailingUnseededDays,
    projectAttribution: { mode: 'multi', projects },
    transactionIdPrefix: 'seed-mp',
    seedRunKey: contractId
      ? `${contractId}:${AI_BUILDER_SEED_EVENT_REVISION}`
      : undefined,
    persona: persona as 'pro' | 'quickstart',
    usageUserIds: [customerId],
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
