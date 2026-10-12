/**
 * Parse `group_keys` from list-billable-metrics: each entry is one **definition**
 * — either a single dimension `["model"]` or a compound key `["api_product","model"]`.
 * Metronome `usage/groups` requires `group_key` to match one of these definitions exactly.
 */
export function parseBillableMetricGroupDefinitions(
  metric: { group_keys?: unknown } | null | undefined,
): string[][] {
  const raw: unknown[] = Array.isArray(metric?.group_keys) ? (metric!.group_keys as unknown[]) : [];
  const defs: string[][] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      defs.push([entry]);
    } else if (Array.isArray(entry)) {
      const strings = entry.filter((x): x is string => typeof x === 'string');
      if (strings.length > 0) defs.push(strings);
    }
  }
  return defs;
}

/**
 * First group_key definition that includes `dimension` (case-insensitive), in API order.
 * Use this as `group_key` on POST `/v1/usage/groups` when breaking out by that dimension.
 */
export function findGroupKeyDefinitionContaining(
  metric: { group_keys?: unknown } | null | undefined,
  dimension: string,
): string[] | null {
  const d = dimension.toLowerCase();
  for (const def of parseBillableMetricGroupDefinitions(metric)) {
    if (def.some((k) => k.toLowerCase() === d)) return def;
  }
  return null;
}

/** All dimension names appearing anywhere in `group_keys` (deduped). */
export function extractAllGroupDimensions(metric: { group_keys?: unknown } | null | undefined): string[] {
  return [...new Set(parseBillableMetricGroupDefinitions(metric).flat())];
}

/**
 * Metronome billable metrics expose `group_keys` as string[] or nested arrays.
 * Extract simple single-dimension keys for usage/group-by API calls.
 */
export function extractSimpleGroupKeys(metric: { group_keys?: unknown } | null | undefined): string[] {
  const raw: unknown[] = Array.isArray(metric?.group_keys) ? (metric!.group_keys as unknown[]) : [];
  const keys: string[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      keys.push(entry);
    } else if (Array.isArray(entry) && entry.length === 1 && typeof entry[0] === 'string') {
      keys.push(entry[0]);
    }
  }
  return keys;
}

/** Prefer `model` when present; otherwise first group key Metronome defines for the metric. */
export function resolveModelGroupDimension(metric: { group_keys?: unknown } | null | undefined): string {
  const keys = extractSimpleGroupKeys(metric);
  const modelKey = keys.find((k) => k.toLowerCase() === 'model');
  return modelKey ?? keys[0] ?? 'model';
}

/**
 * Dimension used for product / surface (e.g. chat) on ingested events — must exist in the metric's `group_keys`
 * for usage/groups filters to work.
 */
export function resolveApiProductGroupDimension(
  metric: { group_keys?: unknown } | null | undefined,
): string | undefined {
  const keys = extractSimpleGroupKeys(metric);
  const exact = keys.find((k) => k.toLowerCase() === 'api_product');
  if (exact) return exact;
  return keys.find((k) => /product/i.test(k) && !/^model$/i.test(k));
}

/**
 * `group_key` for chat + model breakdown: both dimensions must appear in the billable metric, in **definition order**.
 * Returns null if the metric cannot express product + model (caller should fall back to unscoped query).
 */
export function buildChatProductAndModelGroupKey(
  metric: { group_keys?: unknown } | null | undefined,
  modelKey: string,
): string[] | null {
  const keys = extractSimpleGroupKeys(metric);
  const productKey = resolveApiProductGroupDimension(metric);
  if (!productKey || !keys.includes(modelKey)) return null;

  const ordered = keys.filter((k) => k === productKey || k === modelKey);
  if (ordered.length === 2) return ordered;
  // Keys exist but not both in flat list (unusual): use metric-declared order
  const iP = keys.indexOf(productKey);
  const iM = keys.indexOf(modelKey);
  if (iP < 0 || iM < 0) return null;
  return iP < iM ? [productKey, modelKey] : [modelKey, productKey];
}

export interface PickBillableMetricOptions {
  /** Metronome billable metric UUID (from Hub / API). */
  metricId?: string;
  /** Match by display name (case-insensitive). */
  metricName?: string;
}

/**
 * Choose which billable metric powers the usage chart. Does not assume a metric named "API Tokens"
 * (it may be archived). Env overrides first; otherwise first metric that supports chat+model grouping.
 */
export function pickBillableMetricForUsageChart(
  metrics: { id?: string; name?: string; group_keys?: unknown }[],
  options?: PickBillableMetricOptions | null,
): { id?: string; name?: string; group_keys?: unknown } | null {
  if (!metrics?.length) return null;
  const id = options?.metricId?.trim();
  if (id) {
    const m = metrics.find((x) => x.id === id);
    if (m) return m;
    return null;
  }
  const name = options?.metricName?.trim();
  if (name) {
    const lower = name.toLowerCase();
    const m = metrics.find((x) => (x.name ?? '').toLowerCase() === lower);
    if (m) return m;
    return null;
  }
  const chatCapable = metrics.find((m) => {
    const mk = resolveModelGroupDimension(m);
    return buildChatProductAndModelGroupKey(m, mk) != null;
  });
  if (chatCapable) return chatCapable;
  return metrics[0];
}
