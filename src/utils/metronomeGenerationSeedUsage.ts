import Metronome from '@metronome/sdk';
import {
  buildGenerationUsageEvent,
  GENERATION_SKUS,
} from '@/config/generationCatalog';
import { DEMO_METRONOME_USAGE_USER_IDS } from '@/config/demoMetronomeUsageSeats';
import {
  metronomeContractPoolCapCents,
  pickPrimaryMetronomeContract,
} from '@/utils/metronomeContractPool';

export type GenerationSeedStory = 'healthy' | 'at-risk' | 'burst';

const PROJECTS = ['project-atlas', 'project-borealis', 'project-cipher'] as const;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function stableIndex(seed: string, length: number): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

function eventsPerDay(story: GenerationSeedStory, dayIndex: number): number {
  if (story === 'at-risk') return 9 + (dayIndex % 4);
  if (story === 'burst') return dayIndex > 22 ? 16 : 3 + (dayIndex % 2);
  return 4 + (dayIndex % 3);
}

export interface SeedGenerationUsageParams {
  metronome: Metronome;
  customerId: string;
  story?: GenerationSeedStory;
  lookbackDays?: number;
  trailingUnseededDays?: number;
  commitmentSpendCapFraction?: number;
}

export interface SeedGenerationUsageResult {
  ok: true;
  story: GenerationSeedStory;
  daysSeeded: number;
  eventsIngested: number;
  creditsConsumed: number;
  products: string[];
  models: string[];
  projectIds: string[];
  message: string;
}

/**
 * Seeds deterministic generation events. Stable transaction IDs make reruns
 * idempotent while preserving useful model, project, and per-user breakdowns.
 */
export async function seedGenerationUsage({
  metronome,
  customerId,
  story = 'healthy',
  lookbackDays = 30,
  trailingUnseededDays = 1,
  commitmentSpendCapFraction,
}: SeedGenerationUsageParams): Promise<SeedGenerationUsageResult> {
  const safeLookback = Math.min(32, Math.max(1, Math.floor(lookbackDays)));
  const safeTrailing = Math.min(
    safeLookback - 1,
    Math.max(0, Math.floor(trailingUnseededDays)),
  );
  const users =
    DEMO_METRONOME_USAGE_USER_IDS.length > 0
      ? DEMO_METRONOME_USAGE_USER_IDS
      : ['creator@example.com'];
  const now = new Date();
  const events: ReturnType<typeof buildGenerationUsageEvent>[] = [];
  const contracts = await metronome.v2.contracts.list({
    customer_id: customerId,
    covering_date: now.toISOString(),
    include_balance: true,
  } as any);
  const contract = pickPrimaryMetronomeContract(contracts.data ?? []);
  const poolCredits = contract
    ? metronomeContractPoolCapCents({
        commits: contract.commits,
        credits: contract.credits,
      })
    : 0;
  const defaultSpendFraction =
    story === 'at-risk' ? 0.82 : story === 'burst' ? 0.65 : 0.42;
  const spendFraction =
    commitmentSpendCapFraction != null &&
    Number.isFinite(commitmentSpendCapFraction)
      ? Math.min(0.95, Math.max(0.05, commitmentSpendCapFraction))
      : defaultSpendFraction;
  const targetCredits = poolCredits > 0 ? poolCredits * spendFraction : 0;
  const dayOffsets = Array.from(
    { length: safeLookback - safeTrailing },
    (_, index) => safeLookback - index,
  );
  const totalWeight = dayOffsets.reduce(
    (total, _dayOffset, dayIndex) =>
      total + eventsPerDay(story, dayIndex),
    0,
  );

  for (const [dayIndex, dayOffset] of dayOffsets.entries()) {
    const baseCount = eventsPerDay(story, dayIndex);
    const dailyTarget =
      targetCredits > 0
        ? (targetCredits * baseCount) / Math.max(totalWeight, 1)
        : 0;
    let dailyCredits = 0;
    const count = targetCredits > 0 ? 500 : baseCount;

    for (let slot = 0; slot < count; slot += 1) {
      if (targetCredits > 0 && dailyCredits >= dailyTarget) break;
      const seed = `${customerId}:${story}:${dayOffset}:${slot}`;
      const sku = GENERATION_SKUS[stableIndex(`${seed}:sku`, GENERATION_SKUS.length)];
      const userId = users[stableIndex(`${seed}:user`, users.length)];
      const projectId = PROJECTS[stableIndex(`${seed}:project`, PROJECTS.length)];
      const timestamp = new Date(
        now.getTime() -
          dayOffset * MS_PER_DAY +
          (8 * 60 + slot * 43) * 60 * 1000,
      );

      events.push(
        buildGenerationUsageEvent({
          taskId: `seed-${story}-${dayOffset}-${slot}-${sku.id}-${userId}`,
          customerId,
          sku,
          userId,
          workspaceId: `workspace-${customerId}`,
          projectId,
          timestamp: timestamp.toISOString(),
        }),
      );
      dailyCredits += sku.credits;
    }
  }

  for (let offset = 0; offset < events.length; offset += 100) {
    const batch = events.slice(offset, offset + 100).map((event) => ({
      transaction_id: event.transactionId,
      customer_id: event.customerId,
      event_type: event.eventType,
      timestamp: event.timestamp,
      properties: event.properties,
    }));
    await metronome.v1.usage.ingest({ usage: batch });
  }

  return {
    ok: true,
    story,
    daysSeeded: safeLookback - safeTrailing,
    eventsIngested: events.length,
    creditsConsumed: events.reduce(
      (total, event) => total + Number(event.properties.credits_consumed),
      0,
    ),
    products: Array.from(new Set(events.map((event) => String(event.properties.modality)))),
    models: Array.from(new Set(events.map((event) => String(event.properties.model)))),
    projectIds: [...PROJECTS],
    message: `Seeded ${events.length} synthetic generation jobs across ${safeLookback - safeTrailing} days, targeting ${(spendFraction * 100).toFixed(0)}% of the ${poolCredits.toLocaleString()} credit pool.`,
  };
}
