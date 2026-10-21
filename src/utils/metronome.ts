import Metronome from '@metronome/sdk';
import { withFallbackHeaders } from './withFallbackHeaders';
import { DEMO_METRONOME_USAGE_USER_IDS } from '@/config/demoMetronomeUsageSeats';
import {
  API_INSPECTOR_SESSION_HEADER,
  API_INSPECTOR_TRACE_HEADER,
  createTraceId,
  safeJsonParse,
} from '@/utils/apiInspector';
import { publishApiTrace } from '@/utils/apiInspectorServer';

export function initializeMetronome(headers: Headers): Metronome | null {
  const apiKey = withFallbackHeaders(headers).metronomeApiKey;
  if (!apiKey) {
    return null;
  }
  const sessionId = headers.get(API_INSPECTOR_SESSION_HEADER);
  const parentId = headers.get(API_INSPECTOR_TRACE_HEADER) ?? undefined;
  const tracedFetch =
    sessionId &&
    (async (input: RequestInfo | URL, init?: RequestInit) => {
      const id = createTraceId('metronome');
      const startedAt = new Date().toISOString();
      const startedAtMs = Date.now();
      const url = typeof input === 'string' ? input : input.toString();
      const method = String(init?.method ?? 'GET').toUpperCase();
      try {
        const response = await fetch(input, init);
        const body = await response
          .clone()
          .text()
          .then(safeJsonParse)
          .catch(() => undefined);
        publishApiTrace(sessionId, {
          id,
          parentId,
          source: 'metronome',
          method,
          url,
          startedAt,
          durationMs: Date.now() - startedAtMs,
          status: response.status,
          state: response.ok ? 'success' : 'error',
          request: safeJsonParse(init?.body),
          response: body,
        });
        return response;
      } catch (error) {
        publishApiTrace(sessionId, {
          id,
          parentId,
          source: 'metronome',
          method,
          url,
          startedAt,
          durationMs: Date.now() - startedAtMs,
          state: 'error',
          request: safeJsonParse(init?.body),
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    });
  return new Metronome({
    bearerToken: apiKey,
    ...(tracedFetch ? { fetch: tracedFetch } : {}),
  });
}

/** Legacy-account fallback when exact-time package starts are rejected. */
export function nextMetronomeHourBoundary(from = new Date()): Date {
  const boundary = new Date(from);
  const isOnBoundary =
    boundary.getUTCMinutes() === 0 &&
    boundary.getUTCSeconds() === 0 &&
    boundary.getUTCMilliseconds() === 0;
  if (!isOnBoundary) {
    boundary.setUTCHours(boundary.getUTCHours() + 1, 0, 0, 0);
  }
  return boundary;
}

/** Immediate legacy fallback: floor to the current UTC hour. */
export function currentMetronomeHourBoundary(from = new Date()): Date {
  const boundary = new Date(from);
  boundary.setUTCMinutes(0, 0, 0);
  return boundary;
}

export function isMetronomeHourBoundaryError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message ?? error);
  return /(starting at|ending before) is required to be on an hour boundary/i.test(
    message,
  );
}

interface CreateMetronomeCustomerParams {
  name: string;
  stripeCustomerId?: string;
  deliveryMethodId?: string;
  ingestAliases?: string[];
  stripeCollectionMethod?: 'charge_automatically' | 'send_invoice';
}

type StripeDeliveryMethod = 'direct_to_billing_provider' | 'aws_sqs' | 'tackle' | 'aws_sns';

interface StripeBillingProvider {
  billing_provider: string;
  delivery_method?: StripeDeliveryMethod;
  delivery_method_id?: string;
}

/**
 * One connected Stripe account does not need a delivery method id. Metronome
 * selects it from `delivery_method`. An id is required only when several Stripe
 * accounts are connected, and a stale id from the browser or .env makes
 * customer create fail with "Missing delivery providers: STRIPE".
 */
async function resolveStripeBillingLink(
  client: Metronome,
  explicit?: string | null,
): Promise<{ delivery_method: StripeDeliveryMethod; delivery_method_id?: string }> {
  let stripeProviders: StripeBillingProvider[] = [];
  try {
    const res = await client.v1.settings.billingProviders.list({});
    stripeProviders = (res.data ?? []).filter((p) => p.billing_provider === 'stripe');
  } catch (err) {
    console.warn('[createMetronomeCustomer] Could not list billing providers:', err);
  }

  if (stripeProviders.length <= 1) {
    return {
      delivery_method: stripeProviders[0]?.delivery_method ?? 'direct_to_billing_provider',
    };
  }

  const requested = resolveMetronomeDeliveryMethodId(explicit);
  const match = stripeProviders.find((p) => p.delivery_method_id === requested);
  if (!match?.delivery_method_id) {
    throw new Error(
      'More than one Stripe account is connected in Metronome. Set METRONOME_DELIVERY_METHOD_ID to the delivery method for the account you want to bill.',
    );
  }
  return {
    delivery_method: match.delivery_method ?? 'direct_to_billing_provider',
    delivery_method_id: match.delivery_method_id,
  };
}

/**
 * Tools panel header (`demo-metronomedeleivemethodid`) or `METRONOME_DELIVERY_METHOD_ID` env var.
 * The delivery method is auto-populated in client settings on page load (ConfigContext), so it
 * will be present in the header for all requests after initial load.
 */
export function resolveMetronomeDeliveryMethodId(
  explicit?: string | null,
): string | undefined {
  const fromExplicit = explicit?.trim();
  if (fromExplicit) return fromExplicit;
  return process.env.METRONOME_DELIVERY_METHOD_ID?.trim() || undefined;
}

/**
 * Like resolveMetronomeDeliveryMethodId but falls back to querying
 * Metronome's listConfiguredBillingProviders API — the same mechanism
 * ConfigContext uses on the client. Guarantees a value as long as a
 * Stripe delivery method is configured in the Metronome account.
 */
export async function resolveMetronomeDeliveryMethodIdAsync(
  client: Metronome,
  explicit?: string | null,
): Promise<string | undefined> {
  const fromSync = resolveMetronomeDeliveryMethodId(explicit);
  if (fromSync) return fromSync;

  try {
    const res = await (client.v1 as any).listConfiguredBillingProviders({});
    const providers: any[] = res?.data ?? [];
    const stripe = providers.find(
      (p: any) => p.billing_provider === 'stripe' && p.delivery_method_id,
    );
    if (stripe?.delivery_method_id) {
      return stripe.delivery_method_id as string;
    }
  } catch (err) {
    console.warn('[resolveDeliveryMethodId] Could not fetch billing providers:', err);
  }
  return undefined;
}

function taxProviderDisabled(err: unknown): boolean {
  const message = String((err as { message?: string })?.message ?? '');
  return /tax_provider is not enabled/i.test(message);
}

export async function createMetronomeCustomer(
  client: Metronome,
  params: CreateMetronomeCustomerParams,
): Promise<string> {
  const stripeLink = params.stripeCustomerId
    ? await resolveStripeBillingLink(client, params.deliveryMethodId)
    : null;

  const billingConfiguration = (includeTax: boolean) => ({
    billing_provider: 'stripe' as const,
    ...(stripeLink!.delivery_method_id
      ? { delivery_method_id: stripeLink!.delivery_method_id }
      : { delivery_method: stripeLink!.delivery_method }),
    ...(includeTax ? { tax_provider: 'stripe' as const } : {}),
    configuration: {
      stripe_customer_id: params.stripeCustomerId!,
      stripe_collection_method:
        params.stripeCollectionMethod ?? 'charge_automatically',
    },
  });

  const createCustomer = (includeTax: boolean) =>
    client.v1.customers.create({
      name: params.name,
      ingest_aliases: params.ingestAliases ?? [],
      ...(params.stripeCustomerId && stripeLink
        ? { customer_billing_provider_configurations: [billingConfiguration(includeTax)] }
        : {}),
    });

  let includeTax = Boolean(params.stripeCustomerId && stripeLink);
  let customer;
  try {
    customer = await createCustomer(includeTax);
  } catch (err) {
    if (!includeTax || !taxProviderDisabled(err)) throw err;
    console.warn(
      '[createMetronomeCustomer] Stripe tax is not enabled on this Metronome account; creating the customer without tax_provider',
    );
    includeTax = false;
    customer = await createCustomer(false);
  }

  const customerId = customer.data.id;

  // Also register via setBillingConfigurations so the Contracts API can find it.
  if (params.stripeCustomerId && stripeLink) {
    const saveBillingConfiguration = (withTax: boolean) =>
      client.v1.customers.setBillingConfigurations({
        data: [{
          customer_id: customerId,
          ...billingConfiguration(withTax),
        }],
      });
    try {
      await saveBillingConfiguration(includeTax);
    } catch (err) {
      if (!includeTax || !taxProviderDisabled(err)) throw err;
      console.warn(
        '[createMetronomeCustomer] Stripe tax is not enabled; saving the billing configuration without tax_provider',
      );
      await saveBillingConfiguration(false);
    }
  }

  return customerId;
}

export async function listPackages(client: Metronome) {
  const packages: any[] = [];
  for await (const pkg of client.v1.packages.list()) {
    packages.push(pkg);
  }
  return packages;
}

/**
 * Resolves the Stripe customer id linked to a Metronome customer (billing provider config).
 */
export async function getStripeCustomerIdFromMetronomeCustomer(
  client: Metronome,
  metronomeCustomerId: string,
): Promise<string | null> {
  const { data: configs } =
    await client.v1.customers.retrieveBillingConfigurations({
      customer_id: metronomeCustomerId,
    });
  const activeStripe = (configs ?? []).filter(
    (c: any) => c.billing_provider === 'stripe' && !c.archived_at,
  );
  for (const c of activeStripe) {
    const row = c as any;
    const id =
      row.configuration?.stripe_customer_id ??
      row.configuration?.stripeCustomerId ??
      row.stripe_customer_id ??
      null;
    if (typeof id === 'string' && id.startsWith('cus_')) return id;
  }
  return null;
}

interface CreateContractParams {
  metronomeCustomerId: string;
  packageId: string;
  startingAt: string;
  uniquenessKey?: string;
  /** Prefer this Metronome delivery-method UUID when multiple Stripe billing configs exist. */
  preferredDeliveryMethodId?: string;
}

/**
 * Associates a package-provisioned contract with the customer's Stripe billing configuration
 * (`billing_provider_configuration_id`), so invoices route like the customer default.
 */
export async function attachStripeBillingProviderToContract(
  client: Metronome,
  metronomeCustomerId: string,
  contractId: string,
  preferredDeliveryMethodId?: string,
): Promise<void> {
  const { data: configs } =
    await client.v1.customers.retrieveBillingConfigurations({
      customer_id: metronomeCustomerId,
    });

  const activeStripe = configs.filter(
    (c) => c.billing_provider === 'stripe' && !c.archived_at,
  );
  if (activeStripe.length === 0) {
    console.warn(
      '[metronome] No active Stripe billing configuration on customer; skipping contract billing link.',
    );
    return;
  }

  let chosen = activeStripe[0];
  if (preferredDeliveryMethodId) {
    const match = activeStripe.find(
      (c) => c.delivery_method_id === preferredDeliveryMethodId,
    );
    if (match) chosen = match;
  }

  await client.v2.contracts.edit({
    customer_id: metronomeCustomerId,
    contract_id: contractId,
    add_billing_provider_configuration_update: {
      billing_provider_configuration: {
        billing_provider_configuration_id: chosen.id,
      },
      schedule: { effective_at: 'START_OF_CURRENT_PERIOD' },
    },
  });
}

export async function createContract(
  client: Metronome,
  params: CreateContractParams,
): Promise<string> {
  const createParams = {
    customer_id: params.metronomeCustomerId,
    package_id: params.packageId,
    starting_at: params.startingAt,
    ...(params.uniquenessKey
      ? { uniqueness_key: params.uniquenessKey }
      : {}),
  };
  console.log(`[createContract] calling contracts.create with:`, JSON.stringify(createParams));

  try {
    const contract = await client.v1.contracts.create(createParams);
    return contract.data.id;
  } catch (err: any) {
    console.error(`[createContract] contracts.create failed — status: ${err?.status}, message: ${err?.message}, body:`, JSON.stringify(err?.error ?? err?.body ?? {}));
    throw err;
  }
}

export async function getCustomerInvoice(
  client: Metronome,
  metronomeCustomerId: string,
  invoiceId: string,
) {
  const invoice = await client.v1.customers.invoices.retrieve({
    customer_id: metronomeCustomerId,
    invoice_id: invoiceId,
  });
  return invoice.data;
}

export async function listCustomerInvoices(
  client: Metronome,
  metronomeCustomerId: string,
  status?: string,
  sort?: 'date_asc' | 'date_desc',
) {
  const invoices: any[] = [];
  const params: any = { customer_id: metronomeCustomerId };
  if (status) params.status = status;
  if (sort) params.sort = sort;
  for await (const invoice of client.v1.customers.invoices.list(params)) {
    invoices.push(invoice);
  }
  return invoices;
}

// After contract creation, assign the primary seat (user email) and fill remaining
// seats with random IDs for any SEAT_BASED subscriptions on the contract.
export async function assignContractSeats(
  client: Metronome,
  metronomeCustomerId: string,
  contractId: string,
  primarySeatId: string,
): Promise<void> {
  const response = await client.v2.contracts.list({
    customer_id: metronomeCustomerId,
  });
  const contract = response.data.find((c: any) => c.id === contractId);
  if (!contract) return;

  const subscriptions: any[] = contract.subscriptions ?? [];
  if (subscriptions.length === 0) return;

  const startingAt = new Date();
  startingAt.setMinutes(0, 0, 0);

  const updates: any[] = [];
  for (const sub of subscriptions) {
    const isSeatBased =
      sub.quantity_management_mode === 'SEAT_BASED' ||
      sub.quantity_management_mode === 'seat_based' ||
      sub.seat_config != null;
    if (!isSeatBased) continue;

    const totalQuantity: number =
      sub.quantity_schedule?.[0]?.quantity ??
      sub.quantity ??
      sub.initial_quantity ??
      1;
    // Use the demo user handles as seat IDs so seeded usage (user_id) aligns with
    // the assigned seats and Metronome groups per-seat usage correctly.
    const seatIds: string[] = [...DEMO_METRONOME_USAGE_USER_IDS].slice(0, totalQuantity);
    // Pad with randoms if contract has more seats than demo handles
    for (let i = seatIds.length; i < totalQuantity; i++) {
      seatIds.push(`seat-${Math.random().toString(36).slice(2, 10)}`);
    }

    updates.push({
      subscription_id: sub.id,
      seat_updates: {
        add_seat_ids: [
          { seat_ids: seatIds, starting_at: startingAt.toISOString() },
        ],
      },
    });
  }

  if (updates.length === 0) return;

  await (client.v2.contracts as any).edit({
    customer_id: metronomeCustomerId,
    contract_id: contractId,
    update_subscriptions: updates,
  });
}

export async function getCustomerContractsWithBalance(
  client: Metronome,
  metronomeCustomerId: string,
) {
  const response = await client.v2.contracts.list({
    customer_id: metronomeCustomerId,
    include_balance: true,
    include_archived: false,
  } as any);
  return response.data;
}

/** Archives every contract for the customer (e.g. before replacing with a new package on upgrade). */
export async function archiveAllCustomerContracts(
  client: Metronome,
  metronomeCustomerId: string,
): Promise<void> {
  const existing = await client.v2.contracts.list({
    customer_id: metronomeCustomerId,
  });
  for (const contract of existing.data ?? []) {
    await client.v1.contracts.archive({
      contract_id: contract.id,
      customer_id: metronomeCustomerId,
      void_invoices: false,
    });
  }
}

/**
 * Ends contracts active at the transition timestamp without archiving their
 * history. Usage before the boundary remains rated on the old contract.
 */
export async function endActiveCustomerContractsAt(
  client: Metronome,
  metronomeCustomerId: string,
  transitionAt: string,
): Promise<string[]> {
  const existing = await client.v2.contracts.list({
    customer_id: metronomeCustomerId,
    covering_date: transitionAt,
  });
  const contractIds = (existing.data ?? []).map((contract) => contract.id);

  for (const contractId of contractIds) {
    await client.v2.contracts.edit({
      customer_id: metronomeCustomerId,
      contract_id: contractId,
      update_contract_end_date: transitionAt,
      uniqueness_key: `end-for-upgrade:${contractId}:${transitionAt}`,
    });
  }

  return contractIds;
}

/** Restores contracts if creating their replacement fails. */
export async function restoreOpenEndedContracts(
  client: Metronome,
  metronomeCustomerId: string,
  contractIds: string[],
): Promise<void> {
  for (const contractId of contractIds) {
    await client.v2.contracts.edit({
      customer_id: metronomeCustomerId,
      contract_id: contractId,
      update_contract_end_date: null,
    });
  }
}
