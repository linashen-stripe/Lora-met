import Metronome from '@metronome/sdk';
import {
  buildGenerationUsageEvent,
  GENERATION_SKUS,
} from '@/config/generationCatalog';
import { DEMO_METRONOME_USAGE_USER_IDS } from '@/config/demoMetronomeUsageSeats';

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

  for (
    let dayOffset = safeLookback;
    dayOffset > safeTrailing;
    dayOffset -= 1
  ) {
    const dayIndex = safeLookback - dayOffset;
    const count = eventsPerDay(story, dayIndex);

    for (let slot = 0; slot < count; slot += 1) {
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
    message: `Seeded ${events.length} synthetic generation jobs across ${safeLookback - safeTrailing} days.`,
  };
}
