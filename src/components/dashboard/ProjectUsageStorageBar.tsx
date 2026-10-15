'use client';

import { useEffect, useMemo, useState } from 'react';
import { addDays, endOfMonth, format, startOfMonth } from 'date-fns';
import fetchClient from '@/utils/fetchClient';
import { useConfigContext } from '@/contexts/ConfigContext';
import { getEffectiveMetronomeCustomerId } from '@/config/metronomeDefaults';
import { formatMetronomeAmount } from '@/utils/metronomeAmount';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import Skeleton from '@/components/ui/Skeleton';
import { useTranslation } from 'react-i18next';
import { findGroupKeyDefinitionContaining } from '@/utils/metronomeBillableMetrics';
import {
  aggregateMeteredUsageCentsByProjectFromInvoice,
  getMetronomeInvoiceUsageSubtotalCents,
  pickMetronomeSpendInvoice,
} from '@/utils/metronomeInvoice';
import type { MetronomeInvoice } from '@/utils/types';
import { HardDrive } from 'lucide-react';
import useAnimatedNumber from '@/components/hooks/useAnimatedNumber';

interface UsageGroupRow {
  group?: Record<string, string | null>;
  value?: number | null;
}

const PROJECT_PALETTE = [
  'bg-violet-500',
  'bg-sky-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-rose-500',
];

/** Synthetic id when invoice has usage $ but usage/groups has no per-project rows. */
const AGGREGATE_SEGMENT_ID = '__aggregate__';
/** Invoice usage $ not attributed to a project on line items (remainder vs meter total). */
const UNALLOCATED_SEGMENT_ID = '__unallocated__';

/** Integer cents per project; sums to `totalCents` (largest remainder). */
function allocateCentsByTokenShare(
  totalCents: number,
  pairs: { id: string; tokens: number }[],
): number[] {
  const totalTok = pairs.reduce((s, p) => s + p.tokens, 0);
  if (totalTok <= 0 || pairs.length === 0) return pairs.map(() => 0);
  const total = Math.round(totalCents);
  const raw = pairs.map((p) => (total * p.tokens) / totalTok);
  const floors = raw.map((r) => Math.floor(r));
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const fracIdx = [...pairs.keys()].sort(
    (i, j) => raw[j] - floors[j] - (raw[i] - floors[i]),
  );
  const out = [...floors];
  for (const i of fracIdx) {
    if (remainder <= 0) break;
    out[i] += 1;
    remainder -= 1;
  }
  return out;
}

function projectIdFromRow(g: UsageGroupRow): string {
  const gr = g.group as Record<string, string | null | undefined> | undefined;
  if (!gr) return '';
  return (
    gr.project_id ??
    gr.project_Id ??
    Object.entries(gr).find(([k]) => /project/i.test(k))?.[1] ??
    ''
  );
}

function aggregateTokensByProject(rows: UsageGroupRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const g of rows) {
    const pid = projectIdFromRow(g);
    if (!pid) continue;
    const v = g.value ?? 0;
    map.set(pid, (map.get(pid) ?? 0) + v);
  }
  return map;
}

export default function ProjectUsageStorageBar({
  refreshKey = 0,
}: {
  refreshKey?: number;
}) {
  const { customer, metronomeContract, settings } = useConfigContext();
  const { t } = useTranslation();
  const metronomeCustomerId = getEffectiveMetronomeCustomerId(customer);
  const language = settings?.language || 'en';
  const currency = settings?.currency || 'usd';
  const formatAmount = (amount: number) =>
    formatMetronomeAmount(
      amount,
      metronomeContract?.creditTypeName,
      language,
      currency,
    );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usedCents, setUsedCents] = useState(0);
  const [byProjectTokens, setByProjectTokens] = useState<
    { id: string; tokens: number }[]
  >([]);
  /** When invoice has no subtotal yet, still show stacked segments by token share. */
  const [tokenOnlyMode, setTokenOnlyMode] = useState(false);

  const capCents = useMemo(() => {
    const c = metronomeContract?.commitTotal ?? 0;
    if (c > 0) return c;
    return metronomeContract?.creditBalance?.totalAmount ?? 0;
  }, [metronomeContract]);
  const displayedUsedCents = useAnimatedNumber(
    usedCents,
    700,
    usedCents,
    !loading,
  );
  const displayedCapCents = useAnimatedNumber(
    capCents,
    700,
    capCents,
    !loading,
  );

  useEffect(() => {
    if (!metronomeCustomerId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setTokenOnlyMode(false);

    (async () => {
      try {
        const { data: mRes } = await fetchClient.get('/api/metronome/billable-metrics');
        const metrics: { id?: string; name?: string; group_keys?: unknown }[] =
          mRes.metrics ?? [];
        const withProject = metrics.find(
          (m) => findGroupKeyDefinitionContaining(m, 'project_id') != null,
        );
        const metric =
          withProject ??
          metrics.find((m) => /API Tokens/i.test(m.name ?? '')) ??
          metrics[0];

        if (!metric?.id) {
          if (!cancelled) setError(t('dashboard.usage.project_storage.no_metrics'));
          return;
        }

        const projectGroupKey = findGroupKeyDefinitionContaining(metric, 'project_id');
        const metricSupportsProject = projectGroupKey != null;
        const now = new Date();
        const startingOn = format(startOfMonth(now), "yyyy-MM-dd'T'00:00:00'Z'");
        const endingBefore = format(
          addDays(endOfMonth(now), 1),
          "yyyy-MM-dd'T'00:00:00'Z'",
        );

        const basePayload: Record<string, unknown> = {
          billableMetricId: metric.id,
          windowSize: 'day',
          startingOn,
          endingBefore,
        };

        let usageRes = await fetchClient.post(
          `/api/metronome/customer/${metronomeCustomerId}/usage`,
          {
            ...basePayload,
            ...(projectGroupKey ? { groupKey: projectGroupKey } : {}),
          },
        );

        if (usageRes.data?.error) {
          throw new Error(
            usageRes.data.detail ?? usageRes.data.error ?? 'usage error',
          );
        }

        let rows: UsageGroupRow[] = usageRes.data?.data ?? [];
        let tokenMap = aggregateTokensByProject(rows);

        if (tokenMap.size === 0 && !metricSupportsProject) {
          usageRes = await fetchClient.post(
            `/api/metronome/customer/${metronomeCustomerId}/usage`,
            { ...basePayload, groupKey: ['project_id'] },
          );
          if (!usageRes.data?.error) {
            rows = usageRes.data?.data ?? [];
            tokenMap = aggregateTokensByProject(rows);
          }
        }

        const [allInv, draftInv, breakdownsRes] = await Promise.all([
          fetchClient.get(
            `/api/metronome/customer/${metronomeCustomerId}/invoices`,
          ),
          fetchClient.get(
            `/api/metronome/customer/${metronomeCustomerId}/invoices?status=DRAFT&sort=date_desc`,
          ),
          fetchClient.get(
            `/api/metronome/customer/${metronomeCustomerId}/invoice-breakdowns`,
            { params: { starting_on: startingOn, ending_before: endingBefore, window_size: 'day' } },
          ).catch(() => ({ data: { data: [] } })),
        ]);

        // Sum current-month usage from daily breakdowns (same source as pacing chart).
        const currentMonthCents: number = (breakdownsRes.data?.data ?? []).reduce(
          (sum: number, bd: any) =>
            sum + (bd.line_items ?? []).reduce(
              (s: number, li: any) => s + (li.type === 'usage' ? (li.subtotal ?? 0) : 0),
              0,
            ),
          0,
        );

        let pairs = Array.from(tokenMap.entries())
          .map(([id, tokens]) => ({ id, tokens }))
          .sort((a, b) => b.tokens - a.tokens);

        const invoices: MetronomeInvoice[] = allInv.data?.invoices ?? [];
        const drafts: MetronomeInvoice[] = draftInv.data?.invoices ?? [];
        const pick = pickMetronomeSpendInvoice(
          invoices,
          drafts,
          metronomeContract?.id,
        );
        // The list endpoint already includes line_items and totals — use pick directly.
        const invoice: MetronomeInvoice | null = pick;

        // Prefer current-month breakdown total; fall back to full-period invoice subtotal.
        const subtotal = currentMonthCents > 0
          ? currentMonthCents
          : getMetronomeInvoiceUsageSubtotalCents(invoice);
        if (pairs.length === 0 && subtotal > 0 && invoice) {
          const invBuckets =
            aggregateMeteredUsageCentsByProjectFromInvoice(invoice);
          const invSum = invBuckets.reduce((s, b) => s + b.cents, 0);
          if (invBuckets.length > 0) {
            pairs = invBuckets.map(({ id, cents }) => ({
              id,
              tokens: Math.max(0, cents),
            }));
            const orphan = Math.max(0, subtotal - invSum);
            if (orphan > 0) {
              pairs.push({ id: UNALLOCATED_SEGMENT_ID, tokens: orphan });
            }
          }
        }

        const totalTok = pairs.reduce((s, p) => s + p.tokens, 0);

        if (!cancelled) {
          setUsedCents(subtotal);
          setTokenOnlyMode(subtotal <= 0 && totalTok > 0);
          if (pairs.length > 0 && totalTok > 0) {
            setByProjectTokens(pairs);
          } else {
            setByProjectTokens([]);
            // Invoice subtotal can still show usage $ while usage/groups has no
            // project_id rows — aggregate bar + aggregate_bar_note, skip errors.
            if (subtotal <= 0) {
              if (rows.length > 0 && !metricSupportsProject) {
                setError(t('dashboard.usage.project_storage.no_project_dimension'));
              } else if (rows.length === 0 && metricSupportsProject) {
                setError(t('dashboard.usage.project_storage.no_usage_rows'));
              }
            }
          }
        }
      } catch (e: unknown) {
        const msg =
          e &&
          typeof e === 'object' &&
          'response' in e &&
          (e as { response?: { data?: { detail?: string } } }).response?.data
            ?.detail
            ? String(
                (e as { response: { data: { detail: string } } }).response.data
                  .detail,
              )
            : e instanceof Error
              ? e.message
              : String(e);
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    metronomeCustomerId,
    refreshKey,
    metronomeContract?.id,
    metronomeContract?.startingAt,
    t,
  ]);

  const segments = useMemo(() => {
    const totalTok = byProjectTokens.reduce((s, p) => s + p.tokens, 0);
    // Open-invoice dollars can exist even when usage/groups returns no rows with
    // project_id (e.g. meter not grouped by project, or Hub events omit it).
    if (totalTok <= 0 && usedCents > 0 && !tokenOnlyMode) {
      return [
        {
          id: AGGREGATE_SEGMENT_ID,
          cents: usedCents,
          tokens: 0,
          frac: 1,
          color: PROJECT_PALETTE[0],
        },
      ];
    }
    if (totalTok <= 0) return [];
    if (tokenOnlyMode) {
      return byProjectTokens.map((p, i) => ({
        id: p.id,
        cents: 0,
        tokens: p.tokens,
        frac: p.tokens / totalTok,
        color: PROJECT_PALETTE[i % PROJECT_PALETTE.length],
      }));
    }
    if (usedCents <= 0) return [];
    const centsEach = allocateCentsByTokenShare(usedCents, byProjectTokens);
    return byProjectTokens.map((p, i) => ({
      id: p.id,
      cents: centsEach[i] ?? 0,
      tokens: p.tokens,
      frac: p.tokens / totalTok,
      color: PROJECT_PALETTE[i % PROJECT_PALETTE.length],
    }));
  }, [byProjectTokens, usedCents, tokenOnlyMode]);

  const usedRatio =
    tokenOnlyMode && segments.length > 0
      ? 1
      : displayedCapCents > 0
        ? Math.min(
            1,
            displayedUsedCents / Math.max(displayedCapCents, 1),
          )
        : segments.length > 0
          ? 1
          : 0;
  const freeRatio =
    displayedCapCents > 0 && !tokenOnlyMode
      ? Math.max(0, 1 - usedRatio)
      : 0;

  if (!metronomeCustomerId) return null;

  if (loading) {
    return (
      <Card className='bg-white border-border'>
        <CardHeader className='space-y-1.5 p-4 pb-2'>
          <Skeleton className='h-4 w-48' />
        </CardHeader>
        <CardContent className='p-4 pt-0'>
          <Skeleton className='h-10 w-full rounded-xl' />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className='bg-white border-border'>
      <CardHeader className='space-y-1.5 p-4 pb-2'>
        <CardTitle className='flex items-center gap-2 text-lg font-semibold leading-tight'>
          <HardDrive
            className='h-5 w-5 shrink-0 text-gray-900'
            aria-hidden
          />
          {t('dashboard.usage.project_storage.title')}
        </CardTitle>
        {tokenOnlyMode && segments.length > 0 && (
          <p className='mt-1 text-xs text-muted-foreground'>
            {t('dashboard.usage.project_storage.token_share_note')}
          </p>
        )}
        {segments.some((s) => s.id === AGGREGATE_SEGMENT_ID) && (
          <p className='mt-1 text-xs text-muted-foreground'>
            {t('dashboard.usage.project_storage.aggregate_bar_note')}
          </p>
        )}
      </CardHeader>
      <CardContent className='space-y-3 p-4 pt-0'>
        {error && (
          <p className='text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2'>
            {error}
          </p>
        )}

        {(capCents > 0 || usedCents > 0) && (
          <div className='flex flex-wrap justify-between gap-2 text-xs text-muted-foreground sm:text-sm'>
            <span>
              {t('dashboard.usage.project_storage.used')}{' '}
              <span className='font-semibold text-foreground tabular-nums'>
                {tokenOnlyMode
                  ? '—'
                  : formatAmount(displayedUsedCents)}
              </span>
            </span>
            {capCents > 0 && (
              <span>
                {t('dashboard.usage.project_storage.capacity')}{' '}
                <span className='font-semibold text-foreground tabular-nums'>
                  {formatAmount(displayedCapCents)}
                </span>
              </span>
            )}
          </div>
        )}

        <div
          className='flex h-10 w-full overflow-hidden rounded-xl bg-gray-100 ring-1 ring-black/5'
          role='img'
          aria-label={t('dashboard.usage.project_storage.title')}
        >
          {segments.length > 0 ? (
            <>
              <div
                className='flex h-full min-w-0'
                style={{ width: `${usedRatio * 100}%` }}
              >
                {segments.map((s) => {
                  const innerPct = tokenOnlyMode
                    ? s.frac * 100
                    : usedCents > 0
                      ? (s.cents / usedCents) * 100
                      : s.frac * 100;
                  const label =
                    s.id === AGGREGATE_SEGMENT_ID
                      ? t('dashboard.usage.project_storage.aggregated_usage_label')
                      : s.id === UNALLOCATED_SEGMENT_ID
                        ? t('dashboard.usage.project_storage.unallocated_usage_label')
                        : s.id;
                  const title =
                    s.id === AGGREGATE_SEGMENT_ID
                      ? `${label}: ${formatAmount(s.cents)}`
                      : tokenOnlyMode
                        ? `${label}: ${s.tokens.toLocaleString(language)} tokens (${(s.frac * 100).toFixed(0)}%)`
                        : `${label}: ${formatAmount(s.cents)}`;
                  return (
                    <div
                      key={s.id}
                      className={`${s.color} h-full min-w-0 shrink-0`}
                      style={{ width: `${innerPct}%` }}
                      title={title}
                    />
                  );
                })}
              </div>
              {freeRatio > 0.001 && (
                <div
                  className='h-full bg-gray-200/90'
                  style={{ width: `${freeRatio * 100}%` }}
                  title={t('dashboard.usage.project_storage.available')}
                />
              )}
            </>
          ) : (
            <div className='h-full w-full bg-gray-200' />
          )}
        </div>

        {segments.length > 0 && (
          <ul className='flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-600'>
            {segments.map((s, i) => (
              <li key={s.id} className='flex items-center gap-1.5'>
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-sm ${PROJECT_PALETTE[i % PROJECT_PALETTE.length]}`}
                />
                <span className='font-medium text-gray-800'>
                  {s.id === AGGREGATE_SEGMENT_ID
                    ? t('dashboard.usage.project_storage.aggregated_usage_label')
                    : s.id === UNALLOCATED_SEGMENT_ID
                      ? t('dashboard.usage.project_storage.unallocated_usage_label')
                      : s.id}
                </span>
                <span className='tabular-nums'>
                  {tokenOnlyMode
                    ? `${s.tokens.toLocaleString(language)} tok (${(s.frac * 100).toFixed(0)}%)`
                    : formatAmount(s.cents)}
                </span>
              </li>
            ))}
            {capCents > 0 && freeRatio > 0.001 && !tokenOnlyMode && (
              <li className='flex items-center gap-1.5'>
                <span className='inline-block h-2.5 w-2.5 rounded-sm bg-gray-300' />
                <span>{t('dashboard.usage.project_storage.available')}</span>
                <span className='tabular-nums'>
                  {formatAmount(
                    Math.max(0, displayedCapCents - displayedUsedCents),
                  )}
                </span>
              </li>
            )}
          </ul>
        )}

        {!error && !loading && segments.length === 0 && (
          <p className='text-sm text-muted-foreground'>
            {t('dashboard.usage.project_storage.empty_hint')}
          </p>
        )}

        {capCents <= 0 && segments.length > 0 && !tokenOnlyMode && (
          <p className='text-xs text-muted-foreground'>
            {t('dashboard.usage.project_storage.no_commitment_hint')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
