import { NextRequest, NextResponse } from 'next/server';
import { initializeMetronome } from '@/utils/metronome';
import {
  seedGenerationUsage,
  type GenerationSeedStory,
} from '@/utils/metronomeGenerationSeedUsage';

// Seed realistic multi-product, multi-model, multi-project usage for a Metronome customer.
// Usage is attributed to the customer as a single actor (no per-seat user_id splitting).
// Called automatically by the quickstart flow after contract creation.
//
// Usage: GET /api/metronome/seed-usage-multi-project?customerId=<metronomeCustomerId>
// Optional:
//   &story=at-risk       (default: healthy)
//   &contractId=<uuid>   — target a specific contract
//   &contractIndex=<n>   — 0-based list index when contractId omitted (default 0)
//   &spendCap=0.45       — fraction of commitment pool to simulate (default 0.42)

export async function GET(request: NextRequest) {
  const metronome = initializeMetronome(request.headers);
  if (!metronome) {
    return NextResponse.json({ error: 'Metronome not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get('customerId');
  const story = (searchParams.get('story') ?? 'healthy') as GenerationSeedStory;
  const trailingDaysRaw = searchParams.get('trailingDays');
  const lookbackDaysRaw = searchParams.get('lookbackDays');
  const spendCapRaw = searchParams.get('spendCap');
  let trailingUnseededDays: number | undefined;
  let lookbackDays: number | undefined;
  let commitmentSpendCapFraction: number | undefined;
  if (trailingDaysRaw != null && trailingDaysRaw !== '') {
    const v = parseInt(trailingDaysRaw, 10);
    if (Number.isFinite(v) && v >= 0) trailingUnseededDays = v;
  }
  if (lookbackDaysRaw != null && lookbackDaysRaw !== '') {
    const value = parseInt(lookbackDaysRaw, 10);
    if (Number.isFinite(value) && value > 0) lookbackDays = value;
  }
  if (spendCapRaw != null && spendCapRaw !== '') {
    const value = Number(spendCapRaw);
    if (Number.isFinite(value)) commitmentSpendCapFraction = value;
  }
  if (!customerId) {
    return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
  }

  if (!['healthy', 'at-risk', 'burst'].includes(story)) {
    return NextResponse.json({ error: 'Invalid seed story' }, { status: 400 });
  }

  const result = await seedGenerationUsage({
    metronome,
    customerId,
    story,
    ...(lookbackDays !== undefined ? { lookbackDays } : {}),
    ...(trailingUnseededDays !== undefined ? { trailingUnseededDays } : {}),
    ...(commitmentSpendCapFraction !== undefined
      ? { commitmentSpendCapFraction }
      : {}),
  });

  return NextResponse.json(result);
}
