import Stripe from 'stripe';

export interface MetronomeCreditItem {
  name: string;
  available: number;
  total: number;
}

export interface MetronomeAutoTopUp {
  thresholdCents: number;
  rechargeToAmountCents: number;
}

export interface MetronomeContract {
  id: string;
  name: string | null;
  startingAt: string | null;
  /** Pass to `getNetBalance` so balance matches commits/credits on this contract. */
  creditTypeId?: string;
  /** Fiat currency or custom pricing-unit display name (for example, Generation Credits). */
  creditTypeName?: string;
  creditBalance: {
    totalAvailable: number;
    totalAmount: number;
  };
  /** Sum of all commit access_schedule amounts (in cents). Non-zero only for enterprise/commit-based contracts. */
  commitTotal: number;
  /** ISO timestamp of the most-recent active commit's access window start — use as the start of the current billing period. */
  currentPeriodStart: string | null;
  creditItems?: MetronomeCreditItem[];
  autoTopUp?: MetronomeAutoTopUp;
}

export interface MetronomeInvoiceLineItem {
  name: string;
  total: number;
  quantity?: number;
  unit_price?: number;
  type?: string;
  credit_type?: { id: string; name: string };
  /** Billable / rate dimensions (e.g. model, tier). */
  pricing_group_values?: Record<string, string>;
  /** Invoice presentation / grouping keys from Metronome (can duplicate line names across rows). */
  presentation_group_values?: Record<string, string>;
}

export interface MetronomeInvoice {
  id: string;
  status: 'DRAFT' | 'FINALIZED' | 'VOID';
  type: string;
  start_timestamp?: string;
  end_timestamp?: string;
  issued_at?: string;
  total: number;
  /** Pre-credit / pre-adjustment subtotal in minor units when returned by Metronome. */
  subtotal?: number;
  credit_type: { id: string; name: string };
  contract_id?: string;
  /** Present on list and retrieve responses; draft invoices include usage line items per Metronome API. */
  line_items?: MetronomeInvoiceLineItem[];
  external_invoice?: {
    billing_provider_type: string;
    invoice_id?: string;
    pdf_url?: string;
    external_status?: string;
  } | null;
  hosted_invoice_url?: string | null;
  /** Underlying Stripe invoice status (e.g. 'paid'), when enriched via Stripe lookup. */
  stripeStatus?: string | null;
}

export interface PricingPlan {
  id: string;
  display_name: string;
  currency: string;
  live_version: string;
  lookup_key: string;
  expandedComponents?: any[];
  components: {
    license_fee: {
      id: string;
      unit_price: number;
    };
  };
}

export interface MeteredItem {
  id: string;
  display_name: string;
  meter: string;
  meter_event_name?: string;
  meter_segment_conditions?: Array<{
    dimension: string;
    value: string;
  }>;
}

export interface DashboardData {
  creditBalance: {
    total_available: number;
    total_amount: number;
    currency: string;
  };
  billingCadence: Stripe.V2.Billing.Cadence;
  pricingPlan: PricingPlan;
  meteredItems: MeteredItem[];
  meters: Stripe.Billing.Meter[];
}

export interface UnifiedDashboardData extends DashboardData {
  invoices: Stripe.Invoice[];
  previewInvoice: Stripe.Invoice | null;
  autoTopUp: boolean;
  outstandingBalance: {
    outstanding_amount: number;
    has_outstanding_debt: boolean;
    currency: string;
    invoice_details?: {
      subtotal: number;
      total: number;
      rate_card_total: number;
      rate_card_credits_applied: number;
      credits_applied: number;
      usage_items: Array<{
        description: string;
        quantity: number;
        amount: number;
        unit_price: number;
        credits_applied: number;
      }>;
    };
  } | null;
  subscription: {
    id: string;
    status: string;
    billingCadenceId: string;
    planId: string;
    customer?: Stripe.Response<Stripe.Customer | Stripe.DeletedCustomer> | null;
  };
}

export type UsageChartData = Stripe.Billing.Analytics.MeterUsageRow[];
