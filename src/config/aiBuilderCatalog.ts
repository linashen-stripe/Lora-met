export const AI_BUILDER_PACKAGE_NAMES = {
  free: 'AI Builder Free',
  pro: 'AI Builder Pro',
  quickstart: 'AI Builder Enterprise Quickstart',
  legacyFree: 'Free',
  legacyPro: 'Premium',
  legacyQuickstart: 'Enterprise',
} as const;

export const AI_BUILDER_PRO_TERMS = {
  monthlyPriceCents: 2_000,
  monthlyCreditCents: 2_000,
  autoTopUpThresholdCents: 500,
  autoTopUpToCents: 1_500,
} as const;

export const AI_BUILDER_QUICKSTART_TERMS = {
  prepaidCommitmentCents: 250_000,
  durationMonths: 12,
} as const;

