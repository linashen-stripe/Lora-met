import Metronome from '@metronome/sdk';
import {
  buildGenerationUsageEvent,
  generationCreditsForTier,
  GENERATION_SERVICE_TIERS,
  GENERATION_SKUS,
  type GenerationServiceTier,
} from '@/config/generationCatalog';
import { packageByKey } from '@/config/metronomeCatalog';
import {
  metronomeContractPoolCapCents,
  pickPrimaryMetronomeContract,
} from '@/utils/metronomeContractPool';
import {
  DEMO_CONTRACT_LOOKBACK_DAYS,
  preparedProConsumptionFraction,
  quickstartConsumptionFraction,
} from '@/utils/demoUsageSeedProfiles';

export type GenerationSeedStory = 'healthy' | 'at-risk' | 'burst';

const PROJECTS = ['project-atlas', 'project-borealis', 'project-cipher'] as const;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const GENERATION_PRO_PACKAGE = packageByKey('pro');
const GENERATION_PRO_MONTHLY_CREDITS =
  GENERATION_PRO_PACKAGE?.monthlyCredits ?? 1_000;
const GENERATION_PRO_AUTO_TOP_UP_THRESHOLD =
  GENERATION_PRO_PACKAGE?.autoTopUpThresholdCredits ?? 500;
const GENERATION_PRO_HEALTHY_SAFETY_BUFFER_CREDITS = 10;

function stableIndex(seed: string, length: number): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

export interface SeedGenerationUsageParams {
  metronome: Metronome;
  customerId: string;
  story?: GenerationSeedStory;
  lookbackDays?: number;
  trailingUnseededDays?: number;
  commitmentSpendCapFraction?: number;
  /** Optional relative per-user weights for uneven enterprise seat usage. */
  userWeights?: readonly number[];
  /** Explicit user/seat identities. Non-B2B callers default to one actor. */
  usageUserIds?: readonly string[];
  /**
   * Desired credit consumption per user after contract pricing overrides.
   * Supplying this bypasses commitment-pool sizing and is required for B2B.
   */
  perUserTargetCredits?: readonly number[];
  /** Contract multiplier applied to usage (for example 0.85 for B2B). */
  usageMultiplier?: number;
  /** Stable idempotency key, normally the newly-created contract id. */
  seedRunKey?: string;
  /** Prepared non-B2B persona used to choose safe plan-specific pacing. */
  persona?: 'pro' | 'quickstart';
}

export interface SeedGenerationUsageResult {
  ok: true;
  story: GenerationSeedStory;
  daysSeeded: number;
  eventsIngested: number;
  creditsConsumed: number;
  estimatedBalanceConsumption: number;
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
  lookbackDays = DEMO_CONTRACT_LOOKBACK_DAYS,
  trailingUnseededDays = 1,
  commitmentSpendCapFraction,
  userWeights,
  usageUserIds,
  perUserTargetCredits,
  usageMultiplier = 1,
  seedRunKey,
  persona,
}: SeedGenerationUsageParams): Promise<SeedGenerationUsageResult> {
  const safeLookback = Math.min(32, Math.max(1, Math.floor(lookbackDays)));
  const safeTrailing = Math.min(
    safeLookback - 1,
    Math.max(0, Math.floor(trailingUnseededDays)),
  );
  const users =
    usageUserIds?.length
      ? [...usageUserIds]
      : [customerId];
  if (
    perUserTargetCredits &&
    perUserTargetCredits.length !== users.length
  ) {
    throw new Error(
      'perUserTargetCredits must contain exactly one target per usage user.',
    );
  }
  if (!Number.isFinite(usageMultiplier) || usageMultiplier <= 0) {
    throw new Error('usageMultiplier must be positive.');
  }
  const now = new Date();
  const events: ReturnType<typeof buildGenerationUsageEvent>[] = [];
  const contracts = await metronome.v2.contracts.list({
    customer_id: customerId,
    covering_date: now.toISOString(),
    include_balance: true,
  } as any);
  const contract = pickPrimaryMetronomeContract(contracts.data ?? []);
  const parsedContractStartMs = contract?.starting_at
    ? new Date(contract.starting_at).getTime()
    : Number.NaN;
  const contractStartMs = Number.isFinite(parsedContractStartMs)
    ? parsedContractStartMs
    : Number.NEGATIVE_INFINITY;
  const utcTodayMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const poolCredits = contract
    ? metronomeContractPoolCapCents({
        commits: contract.commits,
        credits: contract.credits,
      })
    : 0;
  const defaultSpendFraction =
    persona === 'pro'
      ? preparedProConsumptionFraction(story)
      : persona === 'quickstart'
        ? quickstartConsumptionFraction({
            story,
            startingAt: contract?.starting_at,
            endingBefore: contract?.ending_before,
            now,
          })
        : story === 'at-risk'
          ? 0.82
          : story === 'burst'
            ? 0.65
            : 0.42;
  const spendFraction =
    commitmentSpendCapFraction != null &&
    Number.isFinite(commitmentSpendCapFraction)
      ? Math.min(0.95, Math.max(0.05, commitmentSpendCapFraction))
      : defaultSpendFraction;
  // UNIT INVARIANT: poolCredits and targetCredits are Generation Credits, not
  // USD cents. Do not apply fiat x100 conversions or fractional quantity
  // scaling here. buildGenerationUsageEvent emits whole image/3D jobs and
  // whole video seconds. See the Generation matrix in the regression checklist.
  // Prepared Pro pacing is based on the monthly plan grant only. The contract
  // may also contain an unused auto-top-up commit; counting it would make a
  // Healthy seed exhaust the entire 1,000-credit monthly grant.
  const targetPoolCredits =
    persona === 'pro' ? GENERATION_PRO_MONTHLY_CREDITS : poolCredits;
  const uncappedTargetCredits =
    targetPoolCredits > 0 ? targetPoolCredits * spendFraction : 0;
  // A 50% target would leave exactly 500 credits, which satisfies the seeded
  // Pro auto-top-up threshold. Keep Healthy one smallest whole-job step above
  // that boundary so it remains a near-50% story without triggering recharge.
  const targetCredits =
    persona === 'pro' && story === 'healthy'
      ? Math.min(
          uncappedTargetCredits,
          GENERATION_PRO_MONTHLY_CREDITS -
            GENERATION_PRO_AUTO_TOP_UP_THRESHOLD -
            GENERATION_PRO_HEALTHY_SAFETY_BUFFER_CREDITS,
        )
      : uncappedTargetCredits;
  const dayOffsets = Array.from(
    { length: safeLookback - safeTrailing },
    (_, index) => safeLookback - index,
  );
  const normalizedWeights = users.map((_, index) =>
    Math.max(0, Number(userWeights?.[index] ?? 1)),
  );
  const weightSum =
    normalizedWeights.reduce((sum, weight) => sum + weight, 0) || users.length;
  const desiredConsumptionTargets = perUserTargetCredits
    ? [...perUserTargetCredits]
    : users.map(
        (_, index) =>
          (targetCredits *
            (normalizedWeights[index] || (userWeights ? 0 : 1))) /
          weightSum,
      );
  const listRateTargets = desiredConsumptionTargets.map(
    (target) => target / usageMultiplier,
  );
  const candidates = GENERATION_SKUS.flatMap((sku) =>
    GENERATION_SERVICE_TIERS.map((tier) => ({
      sku,
      serviceTier: tier.value as GenerationServiceTier,
      credits: generationCreditsForTier(
        sku,
        tier.value as GenerationServiceTier,
      ),
    })),
  );
  const coverageSkus = GENERATION_SKUS.filter(
    (sku, index, all) =>
      all.findIndex((candidate) => candidate.modality === sku.modality) ===
      index,
  );
  const coverageCandidates = coverageSkus.flatMap((sku) =>
    GENERATION_SERVICE_TIERS.map((tier) => ({
      sku,
      serviceTier: tier.value as GenerationServiceTier,
      credits: generationCreditsForTier(
        sku,
        tier.value as GenerationServiceTier,
      ),
    })),
  );
  const smallestFirst = [...candidates].sort(
    (left, right) => left.credits - right.credits,
  );
  const runHash = stableIndex(
    seedRunKey ?? contract?.id ?? `${customerId}:${story}`,
    1_000_000_000,
  ).toString(36);
  let sequence = 0;

  for (const [userIndex, userId] of users.entries()) {
    let remaining = listRateTargets[userIndex] ?? 0;
    let userCandidateIndex = 0;
    while (remaining >= (smallestFirst[0]?.credits ?? Infinity)) {
      const coverageCandidate =
        userCandidateIndex < coverageCandidates.length
          ? coverageCandidates[
              (userCandidateIndex + userIndex) % coverageCandidates.length
            ]
          : undefined;
      const candidate =
        coverageCandidate && coverageCandidate.credits <= remaining
          ? coverageCandidate
          : smallestFirst.find((item) => item.credits <= remaining);
      if (!candidate) break;

      // First cover every modality/model in both service tiers with individual
      // events. Afterwards aggregate whole jobs/seconds into larger events so
      // even a large Quickstart history remains a small number of ingest calls.
      const quantityMultiplier =
        userCandidateIndex < coverageCandidates.length
          ? 1
          : Math.max(
              1,
              Math.min(100, Math.floor(remaining / candidate.credits)),
            );
      const dayIndex =
        story === 'burst' && sequence >= coverageCandidates.length
          ? Math.max(0, dayOffsets.length - 1 - (sequence % 4))
          : (sequence * 7) % dayOffsets.length;
      const dayOffset = dayOffsets[dayIndex] ?? 1;
      const timeOfDayMs =
        (8 * 60 + (sequence * 43) % (12 * 60)) * 60 * 1000;
      const timestamp = new Date(
        Math.max(
          utcTodayMs - dayOffset * MS_PER_DAY + timeOfDayMs,
          contractStartMs + timeOfDayMs,
        ),
      );
      const projectId = PROJECTS[sequence % PROJECTS.length];
      events.push(
        buildGenerationUsageEvent({
          taskId: `seed-${story}-${runHash}-u${userIndex}-e${sequence}-${candidate.sku.id}-${candidate.serviceTier}`,
          customerId,
          sku: candidate.sku,
          quantityMultiplier,
          userId,
          workspaceId: `workspace-${customerId}`,
          projectId,
          serviceTier: candidate.serviceTier,
          timestamp: timestamp.toISOString(),
        }),
      );
      remaining -= candidate.credits * quantityMultiplier;
      userCandidateIndex += 1;
      sequence += 1;
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
    estimatedBalanceConsumption:
      events.reduce(
        (total, event) =>
          total + Number(event.properties.credits_consumed),
        0,
      ) * usageMultiplier,
    products: Array.from(new Set(events.map((event) => String(event.properties.modality)))),
    models: Array.from(new Set(events.map((event) => String(event.properties.model)))),
    projectIds: [...PROJECTS],
    message: perUserTargetCredits
      ? `Seeded ${events.length} aggregated generation events with explicit per-seat targets.`
      : `Seeded ${events.length} aggregated generation events across ${safeLookback - safeTrailing} days, targeting ${(spendFraction * 100).toFixed(0)}% of the ${targetPoolCredits.toLocaleString()} credit pool.`,
  };
}
