/**
 * Shared Metronome customer for this demo (no 'use client' — safe for server imports).
 */
export const DEFAULT_METRONOME_CUSTOMER_ID =
  'fd8bcdaa-2eef-44fb-886d-08755616f375' as const;

/** Alias for backwards compatibility with imports from `@/config/config`. */
export const defaultDemoMetronomeCustomerId = DEFAULT_METRONOME_CUSTOMER_ID;

/**
 * When a Stripe customer is logged in (`customer.id`), Metronome calls use their
 * `metronomeCustomerId` from sign-up / Stripe metadata when set; otherwise the shared demo id.
 */
export function getEffectiveMetronomeCustomerId(
  customer: { id?: string; metronomeCustomerId?: string } | null | undefined,
): string | undefined {
  if (!customer?.id) return undefined;
  const fromCustomer = customer.metronomeCustomerId?.trim();
  if (fromCustomer) return fromCustomer;
  return DEFAULT_METRONOME_CUSTOMER_ID;
}

/**
 * Stripe Billing APIs (credit balance, etc.) require a Stripe customer id (`cus_…`).
 * `customer.id` is often a Metronome UUID — prefer `stripeCustomerId` when set.
 */
export function getStripeCustomerIdFromCustomer(
  customer: { id?: string; stripeCustomerId?: string } | null | undefined,
): string | undefined {
  const fromStripe = customer?.stripeCustomerId?.trim();
  if (fromStripe) return fromStripe;
  const id = customer?.id?.trim();
  if (id?.startsWith('cus_')) return id;
  return undefined;
}
