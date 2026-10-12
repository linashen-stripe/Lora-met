'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { format, startOfMonth, addDays, endOfMonth } from 'date-fns';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import Skeleton from '@/components/ui/Skeleton';
import fetchClient from '@/utils/fetchClient';
import { useConfigContext } from '@/contexts/ConfigContext';
import { getEffectiveMetronomeCustomerId } from '@/config/metronomeDefaults';
import { useTranslation } from 'react-i18next';
import {
  resolveModelGroupDimension,
  resolveApiProductGroupDimension,
  buildChatProductAndModelGroupKey,
  pickBillableMetricForUsageChart,
} from '@/utils/metronomeBillableMetrics';
import {
  METRONOME_MODEL_CHART_ORDER,
  metronomeModelDisplayName,
  LORA_MODEL_SLUG,
} from '@/config/metronomeModelLabels';

/** Ingest `properties` use this value for chat (see chat → `/api/metronome/ingest`). */
const CHAT_PRODUCT_VALUE = 'chat';

/**
 * `chat` (default): filter to chat + group by model; Metronome requires filter keys ⊆ group_key.
 * `all`: demo mode — group by model only, all products (previous “shows bars” behavior).
 */
const CHART_SCOPE =
  process.env.NEXT_PUBLIC_TOKEN_USAGE_CHART_SCOPE === 'all' ? 'all' : 'chat';

const FALLBACK_MODEL_ORDER: string[] = [...METRONOME_MODEL_CHART_ORDER];
const MODEL_COLORS: Record<string, string> = {
  [LORA_MODEL_SLUG.mythic46]: '#7C3AED',
  [LORA_MODEL_SLUG.spark45]: '#10B981',
  [LORA_MODEL_SLUG.prime54]: '#F59E0B',
  [LORA_MODEL_SLUG.primeMini54]: '#EF4444',
  [LORA_MODEL_SLUG.echo15]: '#3B82F6',
};

const EXTRA_PALETTE = ['#6366F1', '#14B8A6', '#F97316', '#84CC16', '#EC4899'];

function colorForSeries(key: string, index: number): string {
  return MODEL_COLORS[key] ?? EXTRA_PALETTE[index % EXTRA_PALETTE.length];
}

function buildChatGroupFilters(
  productDim: string,
  modelKey: string,
  selectedModel: string,
): Record<string, string> {
  const f: Record<string, string> = {
    [productDim]: CHAT_PRODUCT_VALUE,
  };
  if (selectedModel !== 'all') {
    f[modelKey] = selectedModel;
  }
  return f;
}

export default function TokenUsageChart({
  refreshKey = 0,
}: {
  refreshKey?: number;
}) {
  const { customer, metronomeContract } = useConfigContext();
  const metronomeCustomerId = getEffectiveMetronomeCustomerId(customer);
  const { t } = useTranslation();

  const [chartData, setChartData] = useState<Record<string, string | number>[]>(
    [],
  );
  const [selectedModel, setSelectedModel] = useState('all');
  const [loading, setLoading] = useState(true);
  const [metricId, setMetricId] = useState<string | null>(null);
  /** Billable metric used for usage/groups (group_keys drive filters). Not tied to a fixed "API Tokens" name. */
  const [usageMetric, setUsageMetric] = useState<Record<string, unknown> | null>(
    null,
  );
  const [groupDimension, setGroupDimension] = useState<string>('model');
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [scopeFallbackNote, setScopeFallbackNote] = useState<string | null>(
    null,
  );
  const [billableMetricsLoaded, setBillableMetricsLoaded] = useState(false);
  const [ungroupedFallback, setUngroupedFallback] = useState(false);

  useEffect(() => {
    fetchClient
      .get('/api/metronome/billable-metrics')
      .then(({ data }) => {
        const list: any[] = data.metrics ?? [];
        const metric = pickBillableMetricForUsageChart(list, {
          metricId: process.env.NEXT_PUBLIC_METRONOME_USAGE_CHART_BILLABLE_METRIC_ID,
          metricName:
            process.env.NEXT_PUBLIC_METRONOME_USAGE_CHART_BILLABLE_METRIC_NAME,
        });
        if (!metric) {
          const hasEnvId = Boolean(
            process.env.NEXT_PUBLIC_METRONOME_USAGE_CHART_BILLABLE_METRIC_ID?.trim(),
          );
          const hasEnvName = Boolean(
            process.env.NEXT_PUBLIC_METRONOME_USAGE_CHART_BILLABLE_METRIC_NAME?.trim(),
          );
          setFetchError(
            list.length === 0
              ? 'No billable metrics returned from Metronome.'
              : hasEnvId || hasEnvName
                ? 'Billable metric from NEXT_PUBLIC_METRONOME_USAGE_CHART_BILLABLE_METRIC_ID / _NAME was not found. Check the UUID or name in Metronome.'
                : 'Could not pick a billable metric for this chart.',
          );
          setMetricId(null);
          setUsageMetric(null);
          return;
        }
        setFetchError(null);
        setMetricId((metric.id as string) ?? null);
        setUsageMetric(metric);
        setGroupDimension(resolveModelGroupDimension(metric));
      })
      .catch((err) => {
        console.error('[TokenUsageChart] billable-metrics failed:', err);
        setFetchError('Could not load billable metrics');
      })
      .finally(() => setBillableMetricsLoaded(true));
  }, []);

  useEffect(() => {
    if (!metronomeCustomerId) {
      setLoading(false);
      return;
    }
    if (!billableMetricsLoaded) return;
    if (!metricId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setFetchError(null);
    setScopeFallbackNote(null);
    setUngroupedFallback(false);

    const now = new Date();
    const contractStart = metronomeContract?.startingAt
      ? new Date(metronomeContract.startingAt)
      : startOfMonth(now);
    const start = format(contractStart, 'yyyy-MM-dd') + 'T00:00:00Z';
    const end =
      format(addDays(endOfMonth(now), 1), 'yyyy-MM-dd') + 'T00:00:00Z';

    const basePayload = {
      billableMetricId: metricId,
      windowSize: 'day' as const,
      startingOn: start,
      endingBefore: end,
    };

    const parseGroupedRows = (rows: any[]) => {
      const dateMap: Record<string, Record<string, number>> = {};
      for (const row of rows) {
        const dateKey = format(new Date(row.starting_on), 'MMM d');
        const g = row.group ?? {};
        const raw =
          g[groupDimension] ??
          g.model ??
          g.Model ??
          (Object.values(g).find((v) => v != null && v !== '') as
            | string
            | undefined);
        const segment =
          raw != null && String(raw).trim() !== ''
            ? String(raw)
            : 'usage';
        if (!dateMap[dateKey]) dateMap[dateKey] = {};
        dateMap[dateKey][segment] =
          (dateMap[dateKey][segment] ?? 0) + (row.value ?? 0);
      }
      return Object.entries(dateMap).map(([date, vals]) => ({ date, ...vals }));
    };

    const parseUngroupedRows = (rows: any[]) => {
      const dateMap: Record<string, Record<string, number>> = {};
      for (const row of rows) {
        const dateKey = format(new Date(row.starting_on), 'MMM d');
        if (!dateMap[dateKey]) dateMap[dateKey] = {};
        dateMap[dateKey].Total =
          (dateMap[dateKey].Total ?? 0) + (Number(row.value) || 0);
      }
      return Object.entries(dateMap).map(([date, vals]) => ({ date, ...vals }));
    };

    const productDim = usageMetric
      ? resolveApiProductGroupDimension(usageMetric)
      : undefined;
    const chatGroupKey = usageMetric
      ? buildChatProductAndModelGroupKey(usageMetric, groupDimension)
      : null;

    let groupedPayload: Record<string, unknown>;
    if (CHART_SCOPE === 'all') {
      groupedPayload = {
        ...basePayload,
        groupKey: [groupDimension],
        ...(selectedModel !== 'all'
          ? { groupFilters: { [groupDimension]: selectedModel } }
          : {}),
      };
    } else if (chatGroupKey && productDim) {
      groupedPayload = {
        ...basePayload,
        groupKey: chatGroupKey,
        groupFilters: buildChatGroupFilters(
          productDim,
          groupDimension,
          selectedModel,
        ),
      };
    } else {
      setScopeFallbackNote(
        'This billable metric has no product + model group keys; showing all products grouped by model.',
      );
      groupedPayload = {
        ...basePayload,
        groupKey: [groupDimension],
        ...(selectedModel !== 'all'
          ? { groupFilters: { [groupDimension]: selectedModel } }
          : {}),
      };
    }

    fetchClient
      .post(
        `/api/metronome/customer/${metronomeCustomerId}/usage`,
        groupedPayload,
      )
      .then(async ({ data: res }) => {
        if (res?.error) {
          setFetchError(
            typeof res.detail === 'string' ? res.detail : res.error,
          );
          setChartData([]);
          return;
        }
        const rows: any[] = res.data ?? [];

        if (rows.length > 0) {
          setChartData(parseGroupedRows(rows));
          return;
        }

        const fallbackPayload =
          CHART_SCOPE === 'all' || !productDim
            ? basePayload
            : {
                ...basePayload,
                groupKey: [productDim],
                groupFilters: { [productDim]: CHAT_PRODUCT_VALUE },
              };

        const { data: ungroupedRes } = await fetchClient.post(
          `/api/metronome/customer/${metronomeCustomerId}/usage`,
          fallbackPayload,
        );
        if (ungroupedRes?.error) {
          setChartData([]);
          return;
        }
        const ungroupedRows: any[] = ungroupedRes.data ?? [];

        if (ungroupedRows.length > 0) {
          setUngroupedFallback(true);
          setChartData(parseUngroupedRows(ungroupedRows));
        } else {
          setChartData([]);
        }
      })
      .catch((err: any) => {
        const d = err?.response?.data;
        const detail =
          typeof d?.detail === 'string'
            ? d.detail
            : d?.detail != null
              ? JSON.stringify(d.detail)
              : undefined;
        const msg =
          detail ??
          (typeof d?.error === 'string' ? d.error : undefined) ??
          err?.message ??
          'Failed to load usage';
        console.error('[TokenUsageChart] fetch failed:', err?.response?.data ?? err);
        setFetchError(msg);
        setChartData([]);
      })
      .finally(() => setLoading(false));
  }, [
    metronomeCustomerId,
    metricId,
    usageMetric,
    billableMetricsLoaded,
    groupDimension,
    selectedModel,
    refreshKey,
    metronomeContract?.startingAt,
  ]);

  const seriesKeys = useMemo(() => {
    const s = new Set<string>();
    for (const row of chartData) {
      for (const k of Object.keys(row)) {
        if (k !== 'date') s.add(k);
      }
    }
    const discovered = Array.from(s);
    discovered.sort((a, b) => {
      if (a === 'Total') return -1;
      if (b === 'Total') return 1;
      const ia = FALLBACK_MODEL_ORDER.indexOf(a);
      const ib = FALLBACK_MODEL_ORDER.indexOf(b);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a.localeCompare(b);
    });
    return discovered;
  }, [chartData]);

  const displayedSeries = useMemo(() => {
    if (
      ungroupedFallback &&
      seriesKeys.length === 1 &&
      seriesKeys[0] === 'Total'
    ) {
      return ['Total'];
    }
    return selectedModel === 'all'
      ? seriesKeys
      : seriesKeys.includes(selectedModel)
        ? [selectedModel]
        : [selectedModel];
  }, [ungroupedFallback, seriesKeys, selectedModel]);

  const modelOptions = useMemo(() => {
    const set = new Set([...FALLBACK_MODEL_ORDER, ...seriesKeys]);
    return Array.from(set);
  }, [seriesKeys]);

  const productDimLabel = usageMetric
    ? resolveApiProductGroupDimension(usageMetric) ?? 'product'
    : 'product';
  const metricLabel =
    typeof usageMetric?.name === 'string' && usageMetric.name
      ? usageMetric.name
      : 'billable metric';

  const scopeDescription =
    CHART_SCOPE === 'all'
      ? `All products — ${metricLabel}`
      : `Chat only (${productDimLabel}=${CHAT_PRODUCT_VALUE}) — ${metricLabel}`;

  return (
    <Card className='bg-white'>
      <CardHeader>
        <div className='flex items-start justify-between flex-wrap gap-3'>
          <div>
            <CardTitle>
              {CHART_SCOPE === 'all'
                ? t('dashboard.token_usage_by_model')
                : t('dashboard.chat_token_usage_by_model')}
            </CardTitle>
            <CardDescription>
              Daily usage — {format(new Date(), 'MMMM yyyy')}. {scopeDescription}.
              Group:{' '}
              <span className='font-mono text-xs'>{groupDimension}</span>
              {CHART_SCOPE === 'chat' && (
                <span className='block mt-0.5 text-xs text-muted-foreground'>
                  Metric:{' '}
                  <code className='rounded bg-muted px-1'>
                    NEXT_PUBLIC_METRONOME_USAGE_CHART_BILLABLE_METRIC_ID
                  </code>{' '}
                  or{' '}
                  <code className='rounded bg-muted px-1'>
                    NEXT_PUBLIC_METRONOME_USAGE_CHART_BILLABLE_METRIC_NAME
                  </code>
                  . Set{' '}
                  <code className='rounded bg-muted px-1'>
                    NEXT_PUBLIC_TOKEN_USAGE_CHART_SCOPE=all
                  </code>{' '}
                  to disable chat filter (demo).
                </span>
              )}
              {scopeFallbackNote && (
                <span className='block mt-1 text-amber-800 text-xs'>
                  {scopeFallbackNote}
                </span>
              )}
              {ungroupedFallback && (
                <span className='block mt-1 text-muted-foreground'>
                  Showing daily totals (no per-model rows returned for this
                  query).
                </span>
              )}
            </CardDescription>
          </div>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className='rounded-md border border-border bg-white px-2 py-1 text-xs text-gray-700'
          >
            <option value='all'>{t('dashboard.usage_pacing.all_models')}</option>
            {modelOptions.map((m) => (
              <option key={m} value={m}>
                {metronomeModelDisplayName(m)}
              </option>
            ))}
          </select>
        </div>
      </CardHeader>
      <CardContent>
        {fetchError && (
          <div className='mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900'>
            {fetchError}
          </div>
        )}
        {!billableMetricsLoaded || loading ? (
          <Skeleton className='h-[300px] w-full' />
        ) : chartData.length === 0 || displayedSeries.length === 0 ? (
          <div className='flex h-[300px] items-center justify-center text-sm text-muted-foreground'>
            {t('dashboard.no_usage_data')}
          </div>
        ) : (
          <ResponsiveContainer width='100%' height={300}>
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray='3 3'
                stroke='#E5E7EB'
                vertical={false}
              />
              <XAxis
                dataKey='date'
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                tickFormatter={(v) => v.toLocaleString()}
                width={60}
              />
              <Tooltip formatter={(value: number) => value.toLocaleString()} />
              <Legend
                iconType='circle'
                iconSize={8}
                wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
              />
              {displayedSeries.map((model, idx) => (
                <Bar
                  key={model}
                  name={metronomeModelDisplayName(model)}
                  dataKey={model}
                  fill={colorForSeries(model, idx)}
                  radius={[3, 3, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
