import Metronome from '@metronome/sdk';
import Stripe from 'stripe';

export interface MetronomeCustomerSummary {
  id: string;
  name: string;
  createdAt: string;
  ingestAliases: string[];
}

/** Active (non-archived) Metronome customers, for display before an archive action. */
export async function listActiveMetronomeCustomers(
  metronome: Metronome,
): Promise<MetronomeCustomerSummary[]> {
  const customers: MetronomeCustomerSummary[] = [];
  for await (const c of metronome.v1.customers.list({ only_archived: false })) {
    customers.push({
      id: c.id,
      name: c.name,
      createdAt: c.created_at,
      ingestAliases: c.ingest_aliases ?? [],
    });
  }
  return customers;
}

export interface ArchiveMetronomeCustomersResult {
  archived: string[];
  failed: { id: string; error: string }[];
}

/**
 * Archives each given Metronome customer id, one at a time. This ONLY calls the
 * archive endpoint (customers.archive) — it does not delete, modify billing
 * configs, or touch anything else. Archiving is irreversible on Metronome's
 * side, so callers must gate this behind an explicit user confirmation.
 */
export async function archiveMetronomeCustomers(
  metronome: Metronome,
  customerIds: string[],
  onLog: (line: string) => void = () => {},
): Promise<ArchiveMetronomeCustomersResult> {
  const archived: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const [i, id] of customerIds.entries()) {
    onLog(`[${i + 1}/${customerIds.length}] Archiving Metronome customer ${id}...`);
    try {
      await metronome.v1.customers.archive({ id });
      archived.push(id);
      onLog(`    ✓ archived ${id}`);
    } catch (error: any) {
      const message = error?.message ?? 'Unknown error';
      failed.push({ id, error: message });
      onLog(`    ✗ failed ${id}: ${message}`);
    }
  }

  return { archived, failed };
}

export interface StripeCustomerSummary {
  id: string;
  name: string | null;
  email: string | null;
  created: number;
  metadata: Record<string, string>;
}

export async function listStripeCustomers(
  stripe: Stripe,
  searchQueries: string[] = [],
): Promise<StripeCustomerSummary[]> {
  // Do not auto-page through the entire Stripe account. Shared demo accounts
  // can contain thousands of customers, which made the cleanup screen appear
  // to hang before deletion could begin.
  const latestPage = await stripe.customers.list({ limit: 100 });
  const searchPages = await Promise.all(
    searchQueries.map((query) =>
      stripe.customers.search({ query, limit: 100 }).catch(() => null),
    ),
  );
  const uniqueCustomers = new Map(
    latestPage.data.map((customer) => [customer.id, customer]),
  );
  for (const page of searchPages) {
    for (const customer of page?.data ?? []) {
      uniqueCustomers.set(customer.id, customer);
    }
  }
  return [...uniqueCustomers.values()]
    .map((customer) => ({
      id: customer.id,
      name: customer.name ?? null,
      email: customer.email ?? null,
      created: customer.created,
      metadata: customer.metadata,
    }))
    .sort((a, b) => b.created - a.created);
}

export interface DeleteStripeCustomersResult {
  deleted: string[];
  failed: { id: string; error: string }[];
}

/**
 * Deletes each given Stripe customer id, one at a time. Irreversible, so
 * callers must gate this behind an explicit user confirmation.
 */
export async function deleteStripeCustomers(
  stripe: Stripe,
  customerIds: string[],
  onLog: (line: string) => void = () => {},
): Promise<DeleteStripeCustomersResult> {
  const deleted: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const [i, id] of customerIds.entries()) {
    onLog(`[${i + 1}/${customerIds.length}] Deleting Stripe customer ${id}...`);
    try {
      await stripe.customers.del(id);
      deleted.push(id);
      onLog(`    ✓ deleted ${id}`);
    } catch (error: any) {
      const message = error?.message ?? 'Unknown error';
      failed.push({ id, error: message });
      onLog(`    ✗ failed ${id}: ${message}`);
    }
  }

  return { deleted, failed };
}
