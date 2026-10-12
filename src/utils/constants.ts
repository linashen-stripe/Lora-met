/**
 * Constants for Stripe customer metadata keys
 */
export const CUSTOMER_METADATA_KEYS = {
  AUTO_TOP_UP_ENABLED: 'auto_top_up_enabled',
  AUTO_TOP_UP_THRESHOLD_CENTS: 'auto_top_up_threshold_cents',
  AUTO_TOP_UP_AMOUNT_CENTS: 'auto_top_up_amount_cents',
  AUTO_TOP_UP_CURRENCY: 'auto_top_up_currency',
  BLOCKED: 'blocked',
} as const;

/**
 * Type for customer metadata keys
 */
export type CustomerMetadataKeys =
  (typeof CUSTOMER_METADATA_KEYS)[keyof typeof CUSTOMER_METADATA_KEYS];
