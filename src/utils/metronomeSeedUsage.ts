/**
 * Metronome usage seeding — customer-agnostic.
 * Resolves the active (or explicitly chosen) contract, rate card products, pool cap,
 * then ingests synthetic `ai_platform.usage` events. HTTP routes wrap {@link seedMetronomeUsage}.
 */
import {
  startOfMonth,
  startOfDay,
  addDays,
  format,
  differenceInCalendarDays,
} from 'date-fns';
import Metronome from '@metronome/sdk';
import { DEMO_METRONOME_USAGE_USER_IDS } from '@/config/demoMetronomeUsageSeats';
import { LORA_MODEL_SLUG } from '@/config/metronomeModelLabels';
import { metronomeContractPoolCapCents } from '@/utils/metronomeContractPool';

export type SeedStory = 'healthy' | 'at-risk';

export { DEMO_METRONOME_USAGE_USER_IDS };

export interface ModelConfig {
  name: string;
  /** $ / 1M tokens for `processing_tier: standard` */
  inputRate: number;
  outputRate: number;
  share: number;
  /** $ / 1M tokens for `processing_tier: batch`; defaults to standard when package has no batch row. */
  batchInputRate?: number;
  batchOutputRate?: number;
}

export interface ProductConfig {
  name: string;
  /** The api_product value sent in ingested events. Defaults to name if not set. */
  eventProductName?: string;
  dailyShare: number;
  supportsBatch: boolean;
  models: ModelConfig[];
}

/**
 * Resolves per-seat `user_id`s for seed-usage GET.
 * - `userIds=a,b,c` wins when non-empty.
 * - Otherwise default: {@link DEMO_METRONOME_USAGE_USER_IDS} (multi-seat demo).
 * - `singleSeat=1` or `perUser=0`: legacy single-actor (customer id only; no synthetic seats).
 */
export function usageUserIdsFromSeedQuery(searchParams: URLSearchParams): string[] | undefined {
  const raw = searchParams.get('userIds');
  if (raw?.trim()) {
    const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length) return ids;
  }
  if (searchParams.get('singleSeat') === '1' || searchParams.get('perUser') === '0') {
    return undefined;
  }
  return [...DEMO_METRONOME_USAGE_USER_IDS];
}

function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}

/** Default: seed synthetic spend to this fraction of pool commitment (headroom below “maxed”). */
export const DEFAULT_COMMITMENT_SPEND_CAP_FRACTION = 0.42;

/**
 * Positive weights summing to 1 — stable for the same `customerId` + `userIds` so re-seeds
 * stay comparable. One seat is designated the persistent heavy user (same seat as the tail
 * month hero) with a moderately dominant share; remaining seats get clearly distinct lower
 * weights so progress bars read as obviously different.
 */
export function perUserSpendWeights(
  customerId: string,
  userIds: readonly string[],
): number[] {
  if (userIds.length === 0) return [];
  if (userIds.length === 1) return [1];
  const heroIdx = djb2Hash(`${customerId}\0seat-hero`) % userIds.length;
  const raw = userIds.map((uid, i) => {
    if (i === heroIdx) {
      // Persistently heavy user — moderately dominant in earlier months
      return 2.5 + (djb2Hash(`${customerId}\0hero-base`) % 3000) / 6000; // 2.5–3.0
    }
    const h = djb2Hash(`${customerId}\0${uid}\0v2\0${i}`);
    // Capped well below hero so only the hero looks dominant; still spread so bars differ
    return 0.1 + (h % 8_000) / 11_000; // 0.1–0.83
  });
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / sum);
}

/**
 * Weights for the **last calendar month** in the seed window (same month as the final seeded day).
 * One seat (same hero as {@link perUserSpendWeights}) gets ~70–75% of that month’s spend so they
 * read as clearly over their per-seat allocation; remaining seats each get deliberately distinct,
 * spread-out shares that are visibly different from each other and well under the limit.
 * Stable for the same `customerId` + `userIds` order.
 */
export function perUserTailMonthSpendWeights(
  customerId: string,
  userIds: readonly string[],
): number[] {
  if (userIds.length === 0) return [];
  if (userIds.length === 1) return [1];
  const heroIdx = djb2Hash(`${customerId}\0seat-hero`) % userIds.length;
  const raw = userIds.map((uid, i) => {
    if (i === heroIdx) {
      // Hero goes over their per-seat allocation in the tail month
      return 4.5 + (djb2Hash(`${customerId}\0hero`) % 2000) / 4000; // 4.5–5.0
    }
    const h = djb2Hash(`${customerId}\0${uid}\0tail\0${i}`);
    // Capped well below hero so only the hero appears over-limit; spread so bars look distinct
    return 0.1 + (h % 8_000) / 11_000; // 0.1–0.83
  });
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / sum);
}

/**
 * Extracts the per-seat monthly credit limit in dollars from a Metronome contract.
 * Looks for SEAT_BASED subscription to get seat count, then finds monthly commits
 * (schedule window ~= 1 month) and divides total amount by seat count.
 */
function extractPerSeatLimitDollars(contract: any, logLabel: string): number {
  // Step 1: get seat count from SEAT_BASED subscription
  const subscriptions: any[] = contract.subscriptions ?? [];
  const seatSub = subscriptions.find(
    (s: any) => s.quantity_management_mode === 'SEAT_BASED' || s.seat_config != null,
  );
  if (!seatSub) return 0;
  const seatCount: number =
    seatSub.quantity_schedule?.[0]?.quantity ?? seatSub.quantity ?? 0;
  if (seatCount <= 0) return 0;

  // Step 2: find monthly commits (schedule window 28–32 days) — these represent
  // the per-seat allocation × seat count billed each month.
  const commits: any[] = contract.commits ?? [];
  for (const commit of commits) {
    const items: any[] = commit.access_schedule?.schedule_items ?? [];
    for (const item of items) {
      const start = new Date(item.starting_at).getTime();
      const end = new Date(item.ending_before).getTime();
      const days = (end - start) / (1000 * 60 * 60 * 24);
      if (days < 28 || days > 32) continue;
      const totalCents = Number(item.amount ?? 0);
      if (totalCents <= 0) continue;
      const perSeatDollars = totalCents / seatCount / 100;
      console.log(`${logLabel} per-seat limit resolved: seatCount=${seatCount}, monthlyCommit=${totalCents} cents → $${perSeatDollars}/seat`);
      return perSeatDollars;
    }
  }

  return 0;
}

function userSlugForTransactionId(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40);
}

/** Default multi-project ids for dashboard group-by demos. */
export const SEED_USAGE_MULTI_PROJECT_IDS = [
  'project-atlas',
  'project-borealis',
  'project-cipher',
] as const;

/** Spend share per project (must sum to 1; same order as {@link SEED_USAGE_MULTI_PROJECT_IDS}). */
export const SEED_USAGE_MULTI_PROJECT_SPEND_SHARES = [0.42, 0.33, 0.25] as const;

const FALLBACK_PRODUCTS: ProductConfig[] = [
  {
    name: 'chat',
    dailyShare: 0.6,
    supportsBatch: true,
    models: [
      { name: LORA_MODEL_SLUG.mythic46, inputRate: 3.0, outputRate: 15.0, share: 0.5 },
      { name: LORA_MODEL_SLUG.prime54, inputRate: 2.5, outputRate: 15.0, share: 0.3 },
      { name: LORA_MODEL_SLUG.primeMini54, inputRate: 0.75, outputRate: 4.5, share: 0.2 },
    ],
  },
  {
    name: 'voice',
    eventProductName: 'realtime_voice',
    dailyShare: 0.1,
    supportsBatch: false,
    models: [
      { name: LORA_MODEL_SLUG.spark45, inputRate: 1.0, outputRate: 5.0, share: 0.6 },
      { name: LORA_MODEL_SLUG.echo15, inputRate: 32.0, outputRate: 64.0, share: 0.4 },
    ],
  },
  {
    name: 'code_assist',
    dailyShare: 0.3,
    supportsBatch: true,
    models: [
      { name: LORA_MODEL_SLUG.mythic46, inputRate: 3.0, outputRate: 15.0, share: 0.6 },
      { name: LORA_MODEL_SLUG.primeMini54, inputRate: 0.75, outputRate: 4.5, share: 0.4 },
    ],
  },
];

export interface MetronomeSeedUsageParams {
  metronome: Metronome;
  customerId: string;
  story?: SeedStory;
  /** Console label, e.g. `[seed-usage]` */
  logLabel: string;
  /**
   * When set, use this contract id from `v2.contracts.list` (may set `include_archived`).
   * Otherwise pick by {@link contractListIndex}.
   */
  contractId?: string;
  /**
   * 0-based index into Metronome’s contract list for this customer (default 0).
   * Ignored when {@link contractId} is set.
   */
  contractListIndex?: number;
  /**
   * If true, only include contracts active on {@link coveringDate} (ISO).
   * Ignored when {@link contractId} is set (we list with `include_archived` to resolve id).
   */
  useCoveringDateFilter?: boolean;
  /** RFC3339 instant for `covering_date` when {@link useCoveringDateFilter} is true (default: now). */
  coveringDate?: string;
  /** Max calendar days Metronome allows looking back from today (default 33). */
  maxLookbackDays?: number;
  /** Trailing calendar days left without seeded events (default 5). */
  trailingUnseededDays?: number;
  /**
   * Override the seed window start date. When set, seeding begins from this date
   * instead of the contract's starting_at — useful when the contract starts at "now"
   * but we still want historical data in the graph.
   */
  seedStartOverride?: Date;
  /** Multiplier on pool-cap dollars: `healthy` / `at-risk` (defaults 0.7 / 1.3). */
  storyMultipliers?: { healthy: number; atRisk: number };
  /**
   * Fraction of **commitment pool** dollars to simulate over the whole seeded window (0.05–0.95).
   * Defaults to {@link DEFAULT_COMMITMENT_SPEND_CAP_FRACTION} so totals stay **below** full allotment.
   * `story=at-risk` still scales up vs healthy using `storyMultipliers` ratio on top of this cap.
   */
  commitmentSpendCapFraction?: number;
  /** Exact synthetic spend target for the full seed window, in major currency units. */
  targetSpendDollars?: number;
  /** When pool cap is 0, target commitment dollars for scaling (default 50). */
  defaultCommitmentDollars?: number;
  /** Single `project_id` or multi-project split for attribution only. */
  projectAttribution:
    | { mode: 'single'; projectId: string }
    | {
        mode: 'multi';
        projects: readonly { projectId: string; spendShare: number }[];
      };
  /** Prefix for `transaction_id` (`seed` vs `seed-mp`). */
  transactionIdPrefix: 'seed' | 'seed-mp';
  /**
   * When non-empty, set `properties.user_id` and `properties.seat_id` per seat (same value) for
   * Metronome group-by-seat / invoice lines. Prefer ids that match **contract seat_ids** when Hub
   * assigned seats; otherwise demo handles still populate charts that key on `user_id`.
   * Earlier months use moderate uneven splits; the **last seeded calendar month** skews one seat.
   * When omitted, `user_id` stays the Metronome `customerId` (legacy single-user seeding).
   */
  usageUserIds?: string[];
}

export type SeedMetronomeUsageResult =
  | {
      ok: true;
      story: SeedStory;
      daysSeeded: number;
      eventsIngested: number;
      estimatedSpendDollars: number;
      /** ISO 4217 currency code (lowercase) from the rate card, e.g. "usd", "gbp". */
      currency: string;
      products: string[];
      models: string[];
      usedContractId: string | null;
      usedRateCardSource: 'rate_card' | 'fallback';
      message: string;
      projectIds?: string[];
    }
  | { ok: false; error: string; status?: number };

interface RateCardBuildResult {
  products: ProductConfig[] | null;
  currency: string | null;
}

async function pickCustomerContract(
  metronome: Metronome,
  customerId: string,
  params: MetronomeSeedUsageParams,
): Promise<any | null> {
  const { logLabel, contractId, contractListIndex = 0, useCoveringDateFilter, coveringDate } =
    params;

  const listParams: Record<string, unknown> = {
    customer_id: customerId,
    include_balance: true,
  };

  if (contractId) {
    listParams.include_archived = true;
  } else if (useCoveringDateFilter) {
    listParams.covering_date = coveringDate ?? new Date().toISOString();
  }

  const contractsRes = await metronome.v2.contracts.list(listParams as any);
  const data: any[] = contractsRes.data ?? [];
  if (data.length === 0) {
    console.warn(`${logLabel} no contracts for customer ${customerId}`);
    return null;
  }

  if (contractId) {
    const hit = data.find((c) => c.id === contractId);
    if (!hit) {
      console.warn(
        `${logLabel} contract_id=${contractId} not found among ${data.length} contract(s)`,
      );
      return null;
    }
    console.log(`${logLabel} using contract ${hit.id} (matched by contractId)`);
    return await retrieveFullContract(metronome, customerId, hit.id, logLabel) ?? hit;
  }

  const idx = Math.min(Math.max(0, contractListIndex), data.length - 1);
  const chosen = data[idx];
  console.log(
    `${logLabel} using contract ${chosen?.id ?? '?'} (list index ${idx} of ${data.length})`,
  );
  return await retrieveFullContract(metronome, customerId, chosen.id, logLabel) ?? chosen;
}

async function retrieveFullContract(
  metronome: Metronome,
  customerId: string,
  contractId: string,
  logLabel: string,
): Promise<any | null> {
  try {
    const res = await metronome.v2.contracts.retrieve({
      customer_id: customerId,
      contract_id: contractId,
      include_balance: true,
    } as any);
    return (res as any).data ?? res;
  } catch (err) {
    console.warn(`${logLabel} failed to retrieve full contract ${contractId}, using list data:`, err);
    return null;
  }
}

async function buildProductsFromContractRateCard(
  metronome: Metronome,
  contract: any,
  logLabel: string,
): Promise<RateCardBuildResult> {
  try {
    let rateCardId: string | undefined = contract.rate_card_id;

    if (!rateCardId && contract.package_id) {
      const pkg = await metronome.v1.packages.retrieve({ package_id: contract.package_id });
      rateCardId = (pkg.data as any).rate_card_id;
    }

    if (!rateCardId) return { products: null, currency: null };

    const [rateCardRes, rates] = await Promise.all([
      metronome.v1.contracts.rateCards.retrieve({ id: rateCardId }).catch(() => null),
      (async () => {
        const acc: any[] = [];
        for await (const rate of metronome.v1.contracts.rateCards.rates.list({
          rate_card_id: rateCardId,
          at: new Date().toISOString(),
        })) {
          acc.push(rate);
        }
        return acc;
      })(),
    ]);

    const currency: string | null =
      (rateCardRes?.data as any)?.fiat_credit_type?.name?.toLowerCase() ?? null;
    if (currency) {
      console.log(`${logLabel} rate card currency: ${currency.toUpperCase()}`);
    }

    if (rates.length === 0) return { products: null, currency };

    console.log(`${logLabel} rate card products (${rates.length} rates):`);
    rates.forEach((r) =>
      console.log(
        `  - name: "${(r as any).product_name}"  price: ${(r as any).rate?.price}  pricing_group_values: ${JSON.stringify((r as any).pricing_group_values ?? {})}  product_id: ${(r as any).product_id}`,
      ),
    );

    type ModelAcc = {
      inputRate: number;
      outputRate: number;
      batchInputRate: number;
      batchOutputRate: number;
    };
    const productMap = new Map<string, Map<string, ModelAcc>>();
    const productHasBatchTokenRates = new Set<string>();

    for (const rate of rates) {
      const name: string = (rate as any).product_name ?? '';
      const pgv: Record<string, string> = (rate as any).pricing_group_values ?? {};
      const modelName: string = pgv.model ?? '';
      const tierRaw = String(pgv.processing_tier ?? 'standard').toLowerCase();

      if (tierRaw !== 'standard' && tierRaw !== 'batch') continue;
      if (!modelName) continue;

      const pricePerUnit: number = (rate as any).rate?.price ?? 0;
      const pricePerMillion = pricePerUnit / 100;

      const match = name.match(/^(.+?)\s+-\s+(Input|Output)\s+Tokens$/i);
      if (!match) continue;

      const [, productName, direction] = match;
      const productKey = productName.toLowerCase().replace(/\s+/g, '_');
      if (tierRaw === 'batch') productHasBatchTokenRates.add(productKey);

      if (!productMap.has(productKey)) productMap.set(productKey, new Map());
      const modelMap = productMap.get(productKey)!;

      if (!modelMap.has(modelName)) {
        modelMap.set(modelName, {
          inputRate: 0,
          outputRate: 0,
          batchInputRate: 0,
          batchOutputRate: 0,
        });
      }
      const modelConfig = modelMap.get(modelName)!;
      const isBatch = tierRaw === 'batch';
      const isInput = direction.toLowerCase() === 'input';

      if (isInput) {
        if (isBatch) modelConfig.batchInputRate = pricePerMillion;
        else modelConfig.inputRate = pricePerMillion;
      } else if (isBatch) {
        modelConfig.batchOutputRate = pricePerMillion;
      } else {
        modelConfig.outputRate = pricePerMillion;
      }
    }

    if (productMap.size === 0) return { products: null, currency };

    const productNames = Array.from(productMap.keys());
    const evenProductShare = 1 / productNames.length;

    const products: ProductConfig[] = productNames.map((productKey) => {
      const modelMap = productMap.get(productKey)!;
      const modelNames = Array.from(modelMap.keys());
      const evenModelShare = 1 / modelNames.length;

      const fallbackProduct = FALLBACK_PRODUCTS.find((p) => p.name === productKey);
      const supportsBatchFromCard = productHasBatchTokenRates.has(productKey);

      return {
        name: productKey,
        eventProductName: fallbackProduct?.eventProductName,
        dailyShare: fallbackProduct?.dailyShare ?? evenProductShare,
        supportsBatch: supportsBatchFromCard || (fallbackProduct?.supportsBatch ?? false),
        models: modelNames.map((modelName) => {
          const acc = modelMap.get(modelName)!;
          const inR = acc.inputRate > 0 ? acc.inputRate : acc.batchInputRate;
          const outR = acc.outputRate > 0 ? acc.outputRate : acc.batchOutputRate;
          const bin = acc.batchInputRate > 0 ? acc.batchInputRate : inR;
          const bout = acc.batchOutputRate > 0 ? acc.batchOutputRate : outR;
          const fallbackModel = fallbackProduct?.models.find((m) => m.name === modelName);
          return {
            name: modelName,
            inputRate: inR,
            outputRate: outR,
            batchInputRate: bin,
            batchOutputRate: bout,
            share: fallbackModel?.share ?? evenModelShare,
          };
        }),
      };
    });

    console.log(`${logLabel} resolved ${products.length} products from rate card ${rateCardId}`);
    return { products, currency };
  } catch (err) {
    console.warn(`${logLabel} failed to fetch rate card, falling back to hardcoded products:`, err);
    return { products: null, currency: null };
  }
}

function getDailyTargets(
  story: SeedStory,
  daysToSeed: number,
  targetTotal: number,
): number[] {
  const spikeChance = story === 'at-risk' ? 0.3 : 0.2;
  const spikeDays = new Set<number>();
  for (let i = 0; i < daysToSeed; i++) {
    if (Math.random() < spikeChance) spikeDays.add(i);
  }

  const raw: number[] = [];
  for (let i = 0; i < daysToSeed; i++) {
    const isSpike = spikeDays.has(i);
    if (story === 'at-risk') {
      const base = 3 + Math.random() * 2;
      raw.push(isSpike ? base + 7 + Math.random() * 8 : base + (Math.random() - 0.5) * 1.5);
    } else {
      const base = 1.5 + Math.random() * 1;
      raw.push(isSpike ? base + 3.5 + Math.random() * 3 : base + (Math.random() - 0.5) * 0.8);
    }
  }

  const rawSum = raw.reduce((s, v) => s + v, 0);
  const scale = rawSum > 0 ? targetTotal / rawSum : 1;
  return raw.map((v) => Math.max(0, v * scale));
}

function weightedIndex(seed: string, weights: readonly number[]): number {
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (total <= 0) return 0;
  let cursor = ((djb2Hash(seed) % 1_000_000) / 1_000_000) * total;
  for (let index = 0; index < weights.length; index += 1) {
    cursor -= Math.max(0, weights[index] ?? 0);
    if (cursor < 0) return index;
  }
  return Math.max(0, weights.length - 1);
}

function tokensForDollar(dollars: number, ratePerMillion: number): number {
  return Math.round((dollars / ratePerMillion) * 1_000_000);
}

const INGEST_BATCH_SIZE = 100;

/** Metronome usage ingest rejects `transaction_id` longer than this. */
const METRONOME_TX_ID_MAX = 128;

/**
 * Short, deterministic-enough ids for ingest deduping. Human-readable product/model
 * names made the legacy format exceed {@link METRONOME_TX_ID_MAX} with UUID + multi-seat + multi-project.
 */
function compactSeedTransactionId(args: {
  transactionIdPrefix: 'seed' | 'seed-mp';
  customerId: string;
  userSlug: string;
  multiSeat: boolean;
  day: Date;
  productIndex: number;
  modelIndex: number;
  tier: string;
  projectIndex: number;
  multiProject: boolean;
  kind: 'u';
  seq: number;
  runId: number;
}): string {
  const pfx = args.transactionIdPrefix === 'seed-mp' ? 'mp' : 'sd';
  const cust = args.customerId.replace(/-/g, '').slice(0, 8);
  const day = format(args.day, 'yyyyMMdd');
  const u =
    args.multiSeat && args.userSlug
      ? `${args.userSlug.replace(/[^a-z0-9]/gi, '').slice(0, 6)}-`
      : '';
  const tierC =
    args.tier === 'batch' ? 'b' : args.tier === 'standard' ? 's' : (args.tier[0] ?? 'x');
  const j = args.multiProject ? `J${args.projectIndex}` : '';
  const nonce = ((djb2Hash(`${args.runId}\0${args.seq}\0${args.kind}`) >>> 0) % 1_000_000_000)
    .toString(36)
    .slice(0, 7);
  const id = `${pfx}-${cust}-${u}${day}-P${args.productIndex}M${args.modelIndex}${tierC}${j}-${args.kind}-${args.seq}-${nonce}`;
  return id.length > METRONOME_TX_ID_MAX ? id.slice(0, METRONOME_TX_ID_MAX) : id;
}

export async function seedMetronomeUsage(
  params: MetronomeSeedUsageParams,
): Promise<SeedMetronomeUsageResult> {
  const {
    metronome,
    customerId,
    story = 'healthy',
    logLabel,
    maxLookbackDays = 33,
    trailingUnseededDays = 5,
    seedStartOverride,
    storyMultipliers = { healthy: 0.7, atRisk: 1.3 },
    commitmentSpendCapFraction: commitmentSpendCapFractionRaw,
    targetSpendDollars,
    defaultCommitmentDollars = 50,
    projectAttribution,
    transactionIdPrefix,
    usageUserIds,
  } = params;

  const usageUserIdsResolved =
    usageUserIds?.length && usageUserIds.every((s) => typeof s === 'string' && s.length > 0)
      ? usageUserIds
      : undefined;

  const contract = await pickCustomerContract(metronome, customerId, params);

  let contractStart: Date | null = null;
  let commitmentCents = 0;
  let usedContractId: string | null = null;

  if (contract) {
    usedContractId = contract.id ?? null;
    contractStart = contract.starting_at ? new Date(contract.starting_at) : null;
    commitmentCents = metronomeContractPoolCapCents({
      commits: contract.commits,
      credits: contract.credits,
    });
    console.log(
      `${logLabel} contract starting_at: ${contract.starting_at ?? 'undefined'}, commitmentCents: ${commitmentCents}`,
    );
  } else if (params.contractId) {
    return {
      ok: false,
      error: `No contract found for customer_id=${customerId} (contract_id=${params.contractId})`,
      status: 404,
    };
  }

  const rateCardResult = contract
    ? await buildProductsFromContractRateCard(metronome, contract, logLabel)
    : { products: null as ProductConfig[] | null, currency: null };

  const products = rateCardResult.products ?? FALLBACK_PRODUCTS;
  const usedRateCardSource = rateCardResult.products ? 'rate_card' : 'fallback';
  const resolvedCurrency = rateCardResult.currency ?? 'usd';
  console.log(
    `${logLabel} using ${usedRateCardSource} products, currency: ${resolvedCurrency.toUpperCase()}, contractStart: ${contractStart?.toISOString() ?? 'null'}`,
  );

  const now = new Date();
  const effectiveContractStart = seedStartOverride ?? contractStart ?? startOfMonth(now);
  const maxLookback = addDays(now, -maxLookbackDays);
  const periodStart =
    effectiveContractStart > maxLookback ? effectiveContractStart : maxLookback;
  const seedStartDay = startOfDay(periodStart);
  const lastSeededDay = startOfDay(addDays(now, -trailingUnseededDays));
  const seedEndDay = lastSeededDay < seedStartDay ? seedStartDay : lastSeededDay;
  const daysToSeed = Math.max(
    1,
    differenceInCalendarDays(seedEndDay, seedStartDay) + 1,
  );
  console.log(
    `${logLabel} periodStart: ${periodStart.toISOString()}, seedEndDay: ${seedEndDay.toISOString()}, daysToSeed: ${daysToSeed} (trailing unseeded: ${trailingUnseededDays}d)`,
  );

  const commitmentDollars =
    commitmentCents > 0 ? commitmentCents / 100 : defaultCommitmentDollars;
  const spendCap =
    commitmentSpendCapFractionRaw != null && Number.isFinite(commitmentSpendCapFractionRaw)
      ? Math.min(0.95, Math.max(0.05, commitmentSpendCapFractionRaw))
      : DEFAULT_COMMITMENT_SPEND_CAP_FRACTION;
  const storyScale =
    story === 'at-risk'
      ? storyMultipliers.atRisk / Math.max(storyMultipliers.healthy, 1e-6)
      : 1;

  // For multi-seat seeding, base the target on per-seat limit × num seats so the hero
  // (~75% share) clearly exceeds their allocation while others stay well under.
  // Falls back to pool-based calculation if the per-seat limit can't be resolved.
  let targetTotal: number;
  if (
    targetSpendDollars != null &&
    Number.isFinite(targetSpendDollars) &&
    targetSpendDollars > 0
  ) {
    targetTotal = targetSpendDollars;
    console.log(
      `${logLabel} explicit seed spend target: $${targetTotal.toFixed(2)}`,
    );
  } else if (usageUserIdsResolved && usageUserIdsResolved.length > 0 && contract) {
    const perSeatLimitDollars = extractPerSeatLimitDollars(contract, logLabel);
    if (perSeatLimitDollars > 0) {
      targetTotal = perSeatLimitDollars * usageUserIdsResolved.length * storyScale;
      console.log(
        `${logLabel} per-seat limit: $${perSeatLimitDollars}, numSeats: ${usageUserIdsResolved.length}, targetTotal: $${targetTotal.toFixed(2)} (seat-based, storyScale ${storyScale.toFixed(2)}×)`,
      );
    } else {
      targetTotal = commitmentDollars * spendCap * storyScale;
      console.log(
        `${logLabel} no per-seat limit found — falling back to pool-based target: $${targetTotal.toFixed(2)}`,
      );
    }
  } else {
    targetTotal = commitmentDollars * spendCap * storyScale;
    console.log(
      `${logLabel} commitment: $${commitmentDollars}, spendCap: ${(spendCap * 100).toFixed(0)}% of pool, targetTotal: $${targetTotal.toFixed(2)} (${story}, storyScale ${storyScale.toFixed(2)}×)`,
    );
  }

  const projectSlices =
    projectAttribution.mode === 'single'
      ? [{ projectId: projectAttribution.projectId, spendShare: 1 }]
      : [...projectAttribution.projects];

  if (projectAttribution.mode === 'multi') {
    console.log(
      `${logLabel} projects: ${projectSlices.map((p) => p.projectId).join(', ')}`,
    );
  }

  const dailyTargets = getDailyTargets(story, daysToSeed, targetTotal);
  const runId = Date.now();
  const events: any[] = [];
  let txSeq = 0;
  const perUserWeights =
    usageUserIdsResolved && usageUserIdsResolved.length > 0
      ? perUserSpendWeights(customerId, usageUserIdsResolved)
      : null;

  const perUserTailWeights =
    usageUserIdsResolved && usageUserIdsResolved.length > 1
      ? perUserTailMonthSpendWeights(customerId, usageUserIdsResolved)
      : null;

  const tailMonthKey = format(seedEndDay, 'yyyy-MM');
  const seedStartMonthKey = format(seedStartDay, 'yyyy-MM');
  const hasDaysBeforeTailMonth = seedStartMonthKey !== tailMonthKey;

  if (usageUserIdsResolved?.length && perUserWeights) {
    if (hasDaysBeforeTailMonth) {
      const baseParts = usageUserIdsResolved.map(
        (u, i) => `${u}=${((perUserWeights[i] ?? 0) * 100).toFixed(1)}%`,
      );
      console.log(
        `${logLabel} per-user share before tail month (days before ${tailMonthKey}): ${baseParts.join(', ')}`,
      );
    }
    if (perUserTailWeights) {
      const tailParts = usageUserIdsResolved.map(
        (u, i) => `${u}=${((perUserTailWeights[i] ?? 0) * 100).toFixed(1)}%`,
      );
      console.log(
        `${logLabel} per-user share in tail month ${tailMonthKey} (one seat heavy vs varied lighter seats): ${tailParts.join(', ')}`,
      );
    }
  }

  const seatSpendSlices =
    usageUserIdsResolved?.length && perUserWeights
      ? usageUserIdsResolved.map((uid, i) => ({
          seatUserId: uid,
          baseWeight: perUserWeights[i] ?? 0,
          tailWeight: perUserTailWeights?.[i] ?? perUserWeights[i] ?? 0,
          txSeg: userSlugForTransactionId(uid),
        }))
      : [
          {
            seatUserId: customerId,
            baseWeight: 1,
            tailWeight: 1,
            txSeg: userSlugForTransactionId(customerId),
          },
        ];
  const coverageProductSchedule = products.flatMap((product, productIndex) =>
    Array.from(
      {
        length: Math.max(
          product.models.length,
          product.supportsBatch ? 2 : 1,
        ),
      },
      () => productIndex,
    ),
  );
  const productOccurrences = seatSpendSlices.map(() =>
    products.map(() => 0),
  );

  for (let dayIdx = 0; dayIdx < daysToSeed; dayIdx++) {
    const day = addDays(seedStartDay, dayIdx);
    const daySpendTotal = dailyTargets[dayIdx];
    const isTailMonth =
      seatSpendSlices.length > 1 && format(day, 'yyyy-MM') === tailMonthKey;

    for (
      let seatIndex = 0;
      seatIndex < seatSpendSlices.length;
      seatIndex += 1
    ) {
      const { seatUserId, baseWeight, tailWeight, txSeg } =
        seatSpendSlices[seatIndex]!;
      const weight = isTailMonth ? tailWeight : baseWeight;
      const dailySpend = daySpendTotal * weight;
      const selectionSeed = `${customerId}:${dayIdx}:${seatIndex}`;
      const productIndex =
        coverageProductSchedule[dayIdx] ??
        weightedIndex(
          `${selectionSeed}:product`,
          products.map((product) => product.dailyShare),
        );
      const product = products[productIndex]!;
      const occurrence = productOccurrences[seatIndex]![productIndex]!;
      productOccurrences[seatIndex]![productIndex] = occurrence + 1;
      const modelIndex =
        occurrence < product.models.length
          ? occurrence
          : weightedIndex(
              `${selectionSeed}:model`,
              product.models.map((model) => model.share),
            );
      const model = product.models[modelIndex]!;
      const tier =
        product.supportsBatch &&
        (occurrence === 1 ||
          weightedIndex(`${selectionSeed}:tier`, [0.75, 0.25]) === 1)
          ? 'batch'
          : 'standard';
      const projectIndex =
        txSeq < projectSlices.length
          ? txSeq
          : weightedIndex(
              `${selectionSeed}:project`,
              projectSlices.map((project) => project.spendShare),
            );
      const projectId = projectSlices[projectIndex]!.projectId;
      const inputRate =
        tier === 'batch'
          ? (model.batchInputRate ?? model.inputRate)
          : model.inputRate;
      const outputRate =
        tier === 'batch'
          ? (model.batchOutputRate ?? model.outputRate)
          : model.outputRate;
      const inputTokens = tokensForDollar(dailySpend * 0.6, inputRate);
      const outputTokens = tokensForDollar(dailySpend * 0.4, outputRate);
      const timestamp = new Date(day);
      timestamp.setHours(
        9 + (djb2Hash(`${selectionSeed}:hour`) % 8),
        djb2Hash(`${selectionSeed}:minute`) % 60,
      );

      events.push({
        transaction_id: compactSeedTransactionId({
          transactionIdPrefix,
          customerId,
          userSlug: txSeg,
          multiSeat: seatSpendSlices.length > 1,
          day,
          productIndex,
          modelIndex,
          tier,
          projectIndex,
          multiProject: projectSlices.length > 1,
          kind: 'u',
          seq: txSeq++,
          runId,
        }),
        customer_id: customerId,
        event_type: 'ai_platform.usage',
        timestamp: timestamp.toISOString(),
        properties: {
          api_product: product.eventProductName ?? product.name,
          upstream_provider: 'lora',
          model: model.name,
          processing_tier: tier,
          user_id: seatUserId,
          ...(seatSpendSlices.length > 1 ? { seat_id: seatUserId } : {}),
          team_id: customerId,
          project_id: projectId,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
        },
      });
    }
  }

  if (events.length > 0) {
    console.log(`${logLabel} total events to ingest: ${events.length}`);
    console.log(`${logLabel} sample event:`, JSON.stringify(events[0], null, 2));
    const voiceSample = events.find((e) => e.properties.api_product === 'realtime_voice');
    if (voiceSample) {
      console.log(`${logLabel} sample voice event:`, JSON.stringify(voiceSample, null, 2));
    } else {
      console.log(`${logLabel} no voice events found`);
    }
  }

  let ingested = 0;
  for (let i = 0; i < events.length; i += INGEST_BATCH_SIZE) {
    const batch = events.slice(i, i + INGEST_BATCH_SIZE);
    await metronome.v1.usage.ingest({ usage: batch });
    ingested += batch.length;
    console.log(
      `${logLabel} batch ${Math.floor(i / INGEST_BATCH_SIZE) + 1} done — ${ingested} total ingested`,
    );
  }

  const estimatedSpend = dailyTargets.reduce((s, d) => s + d, 0);
  const models = [...new Set(products.flatMap((p) => p.models.map((m) => m.name)))];

  const userSuffix = usageUserIdsResolved?.length
    ? ` (per-seat user_id: ${usageUserIdsResolved.join(', ')}; tail month ${tailMonthKey} uses skewed shares)`
    : '';

  const currencySymbol = resolvedCurrency === 'gbp' ? '£' : resolvedCurrency === 'eur' ? '€' : '$';
  const baseMessage =
    projectSlices.length > 1
      ? `Seeded ${daysToSeed} days of ${story} usage (multi-project) across ${products.length} products for customer ${customerId}. Projects: ${projectSlices.map((p) => p.projectId).join(', ')}. Estimated spend: ${currencySymbol}${estimatedSpend.toFixed(2)} ${resolvedCurrency.toUpperCase()}${userSuffix}.`
      : `Seeded ${daysToSeed} days of ${story} usage across ${products.length} products and ${models.length} models for customer ${customerId}. Estimated spend: ${currencySymbol}${estimatedSpend.toFixed(2)} ${resolvedCurrency.toUpperCase()}${userSuffix}.`;

  return {
    ok: true,
    story,
    daysSeeded: daysToSeed,
    eventsIngested: ingested,
    estimatedSpendDollars: Math.round(estimatedSpend * 100) / 100,
    currency: resolvedCurrency,
    products: products.map((p) => p.name),
    models,
    usedContractId,
    usedRateCardSource,
    message: baseMessage,
    projectIds:
      projectSlices.length > 1 ? projectSlices.map((p) => p.projectId) : undefined,
  };
}
