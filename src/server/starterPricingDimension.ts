export type StarterPricingDimension<Metric extends string = string> = {
  propertyKey: string;
  values: Array<{ value: string; multiplier: number }>;
  metrics: Metric[];
};

type ValidationOptions<Metric extends string> = {
  metricKeys: readonly Metric[];
  reservedPropertyKeys: ReadonlySet<string>;
  metricLabel: string;
};

/**
 * Shared validation for the one optional starter-only pricing property.
 * Individual starters still own their canonical dimensions and metric names.
 */
export function validateStarterPricingDimension<Metric extends string>(
  value: unknown,
  options: ValidationOptions<Metric>,
): StarterPricingDimension<Metric> | null {
  if (value == null) return null;
  if (!value || typeof value !== 'object') {
    throw new Error('Custom pricing property must be an object.');
  }
  const candidate = value as {
    propertyKey?: unknown;
    values?: unknown;
    metrics?: unknown;
  };
  const propertyKey =
    typeof candidate.propertyKey === 'string'
      ? candidate.propertyKey.trim()
      : '';
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(propertyKey)) {
    throw new Error(
      'Property key must use lowercase letters, numbers, and underscores.',
    );
  }
  if (options.reservedPropertyKeys.has(propertyKey)) {
    throw new Error(`Property key "${propertyKey}" is reserved.`);
  }
  if (
    !Array.isArray(candidate.values) ||
    candidate.values.length < 2 ||
    candidate.values.length > 4
  ) {
    throw new Error('Custom pricing property requires 2–4 values.');
  }
  const values = candidate.values.map((entry, index) => {
    const row =
      entry && typeof entry === 'object'
        ? (entry as { value?: unknown; multiplier?: unknown })
        : {};
    const item = typeof row.value === 'string' ? row.value.trim() : '';
    const multiplier = Number(row.multiplier);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(item)) {
      throw new Error(`Custom pricing value ${index + 1} is invalid.`);
    }
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      throw new Error(`Multiplier for "${item}" must be greater than zero.`);
    }
    return { value: item, multiplier };
  });
  if (new Set(values.map(({ value: item }) => item)).size !== values.length) {
    throw new Error('Custom pricing property values must be unique.');
  }
  if (!Array.isArray(candidate.metrics)) {
    throw new Error(`Select at least one ${options.metricLabel} usage metric.`);
  }
  const validMetrics = new Set<string>(options.metricKeys);
  const metrics = candidate.metrics.filter(
    (metric): metric is Metric =>
      typeof metric === 'string' && validMetrics.has(metric),
  );
  if (
    metrics.length === 0 ||
    metrics.length !== candidate.metrics.length ||
    new Set(metrics).size !== metrics.length
  ) {
    throw new Error(
      `Select at least one valid ${options.metricLabel} usage metric.`,
    );
  }
  return { propertyKey, values, metrics };
}
