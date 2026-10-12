import type { MetronomeInvoice, MetronomeInvoiceLineItem } from '@/utils/types';

export function isAppliedCommitOrCreditLineItem(type?: string): boolean {
  return (type ?? '').toLowerCase() === 'applied_commit_or_credit';
}

function isMeteredUsageLineItem(type?: string): boolean {
  return (type ?? '').toLowerCase() === 'usage';
}

function projectIdFromInvoiceLineItem(l: MetronomeInvoiceLineItem): string {
  const pres = l.presentation_group_values ?? {};
  const price = l.pricing_group_values ?? {};
  const fromPres =
    pres.project_id ??
    Object.entries(pres).find(([k]) => /project/i.test(k))?.[1];
  const fromPrice =
    price.project_id ??
    Object.entries(price).find(([k]) => /project/i.test(k))?.[1];
  const raw = fromPres ?? fromPrice;
  return raw != null && String(raw).trim() !== '' ? String(raw).trim() : '';
}

/**
 * Sums meter `usage` line totals on the invoice by `project_id` (presentation or
 * pricing dimensions). Used when usage/groups has no per-project rows but the
 * draft invoice still attributes spend to projects.
 */
export function aggregateMeteredUsageCentsByProjectFromInvoice(
  invoice: MetronomeInvoice | null | undefined,
): { id: string; cents: number }[] {
  if (!invoice?.line_items?.length) return [];
  const map = new Map<string, number>();
  for (const l of invoice.line_items) {
    if (isAppliedCommitOrCreditLineItem(l.type)) continue;
    if (!isMeteredUsageLineItem(l.type)) continue;
    const pid = projectIdFromInvoiceLineItem(l);
    if (!pid) continue;
    map.set(pid, (map.get(pid) ?? 0) + (Number(l.total) || 0));
  }
  if (map.size === 0) return [];
  return [...map.entries()]
    .map(([id, cents]) => ({ id, cents }))
    .sort((a, b) => b.cents - a.cents);
}

/**
 * Billable **meter usage** in minor units (USD cents) from the draft invoice’s
 * `type: "usage"` line items only. Excludes commits, subscriptions, and other
 * non-usage charges so the usage dashboard bar matches Metronome usage (~$0.29)
 * instead of inflating with e.g. a $20 prepaid line.
 *
 * Falls back to all non–credit charge lines only when no `usage` rows exist
 * (older payloads). If there are no line items, uses `invoice.subtotal` when set.
 */
export function getMetronomeInvoiceUsageSubtotalCents(
  invoice: MetronomeInvoice | null | undefined,
): number {
  if (!invoice) return 0;
  const items = invoice.line_items ?? [];

  // Prefer explicit usage-typed lines
  const usageLines = items.filter((l) => isMeteredUsageLineItem(l.type));
  if (usageLines.length > 0) {
    return usageLines.reduce((sum, l) => sum + (Number(l.total) || 0), 0);
  }

  // Fall back: sum all non-commit/credit charge lines (older payloads)
  const chargeLines = items.filter((l) => !isAppliedCommitOrCreditLineItem(l.type));
  if (chargeLines.length > 0) {
    return chargeLines.reduce((sum, l) => sum + (Number(l.total) || 0), 0);
  }

  // Last resort: use invoice subtotal or total
  return Number(invoice.subtotal ?? invoice.total) || 0;
}

function invoiceSortKey(inv: MetronomeInvoice): number {
  const raw = inv.end_timestamp ?? inv.issued_at ?? '';
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Prefer the current DRAFT; if none (e.g. period finalized), use the latest non-VOID invoice.
 */
function isValidInvoiceSummary(i: unknown): i is MetronomeInvoice {
  return (
    i != null &&
    typeof i === 'object' &&
    typeof (i as MetronomeInvoice).id === 'string' &&
    (i as MetronomeInvoice).id.length > 0
  );
}

export function pickMetronomeSpendInvoice(
  allInvoices: MetronomeInvoice[],
  draftInvoices: MetronomeInvoice[],
): MetronomeInvoice | null {
  const drafts = draftInvoices.filter(isValidInvoiceSummary);
  if (drafts.length > 0) {
    // Prefer the most-recent draft that actually has usage line items; only fall
    // back to a line-item-less draft when none with data exist.
    const withItems = drafts.filter((d) => (d.line_items?.length ?? 0) > 0);
    return (withItems[0] ?? drafts[0]) ?? null;
  }
  const pool = allInvoices.filter(
    (i) => isValidInvoiceSummary(i) && i.status !== 'VOID',
  );
  if (pool.length === 0) return null;
  return [...pool].sort((a, b) => invoiceSortKey(b) - invoiceSortKey(a))[0] ?? null;
}
