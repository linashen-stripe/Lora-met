import type Stripe from 'stripe';
import type { UnifiedDashboardData } from '@/utils/types';
import initializeStripe from '@/utils/stripe';

/**
 * Minimal unified dashboard payload for Metronome-managed billing. Stripe is
 * only used here to attach the linked `cus_…` customer (default payment method)
 * for {@link PaymentMethod}.
 */
export function metronomeHybridDashboardPlaceholder(
  _metronomeCustomerId: string,
): UnifiedDashboardData {
  return {
    creditBalance: {
      total_available: 0,
      total_amount: 0,
      currency: 'usd',
    },
    billingCadence: {} as UnifiedDashboardData['billingCadence'],
    meteredItems: [],
    meters: [],
    invoices: [],
    previewInvoice: null,
    autoTopUp: false,
    outstandingBalance: null,
    subscription: {
      id: 'metronome',
      status: 'active',
      billingCadenceId: '',
      planId: '',
      customer: null,
    },
  } as UnifiedDashboardData;
}

/**
 * Metronome-forward dashboard: no Stripe subscription APIs. Optionally loads the
 * Stripe Customer (payment method UI) when `stripeCustomerId` is `cus_…`.
 */
export async function buildMetronomeForwardDashboard(
  headers: Headers,
  metronomeCustomerId: string,
  stripeCustomerId: string | null,
): Promise<UnifiedDashboardData> {
  const base = metronomeHybridDashboardPlaceholder(metronomeCustomerId);

  if (!stripeCustomerId?.startsWith('cus_')) {
    return base;
  }

  try {
    const stripe = initializeStripe(headers);
    const retrieved = await stripe.customers.retrieve(stripeCustomerId, {
      expand: ['invoice_settings.default_payment_method'],
    });
    if (retrieved.deleted) {
      return base;
    }
    const customer = retrieved as Stripe.Customer;

    return {
      ...base,
      subscription: {
        ...base.subscription,
        customer,
      },
    } as UnifiedDashboardData;
  } catch {
    return base;
  }
}
