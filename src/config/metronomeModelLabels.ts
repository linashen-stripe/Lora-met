/**
 * Metronome ingest uses `properties.model` with these slugs — keep aligned with the rate card.
 * Display names are fictional “Lora” SKUs (no vendor model names).
 */
export const LORA_MODEL_SLUG = {
  mythic46: 'lora-mythic-4.6',
  prime54: 'lora-prime-5.4',
  primeMini54: 'lora-prime-mini-5.4',
  spark45: 'lora-spark-4.5',
  echo15: 'lora-echo-1.5',
} as const;

export type LoraModelSlug = (typeof LORA_MODEL_SLUG)[keyof typeof LORA_MODEL_SLUG];

export const METRONOME_MODEL_DISPLAY_NAMES: Record<LoraModelSlug, string> = {
  [LORA_MODEL_SLUG.mythic46]: 'Lora Mythic 4.6',
  [LORA_MODEL_SLUG.prime54]: 'Lora Prime 5.4',
  [LORA_MODEL_SLUG.primeMini54]: 'Lora Prime Mini 5.4',
  [LORA_MODEL_SLUG.spark45]: 'Lora Spark 4.5',
  [LORA_MODEL_SLUG.echo15]: 'Lora Echo 1.5',
};

/** Stacked bar / legend order on the usage chart. */
export const METRONOME_MODEL_CHART_ORDER: readonly LoraModelSlug[] = [
  LORA_MODEL_SLUG.mythic46,
  LORA_MODEL_SLUG.spark45,
  LORA_MODEL_SLUG.prime54,
  LORA_MODEL_SLUG.primeMini54,
  LORA_MODEL_SLUG.echo15,
];

export function metronomeModelDisplayName(slug: string): string {
  return (
    METRONOME_MODEL_DISPLAY_NAMES[slug as LoraModelSlug] ?? slug
  );
}

/** Chat UI tiers → slug on `ai_platform.usage` events for product `chat`. */
export const CHAT_TIER_TO_METRONOME_MODEL = {
  mini: LORA_MODEL_SLUG.primeMini54,
  standard: LORA_MODEL_SLUG.mythic46,
  large: LORA_MODEL_SLUG.prime54,
} as const;
