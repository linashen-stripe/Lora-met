'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';
import {
  format,
  startOfMonth,
  endOfMonth,
  addDays,
  eachDayOfInterval,
} from 'date-fns';
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
import { TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const PURPLE = '#7C3AED';
const BLUE = '#3B82F6';
const GREEN = '#10B981';
const RED = '#EF4444';
const GRAY = '#E5E7EB';

// Derive a stable product label from generation line items.
function productFromLineItemName(name: string): string | null {
  const match = name.match(/^(.+?)\s+-\s+(Input|Output)\s+Tokens$/i);
  const productName = match?.[1] ?? name.trim();
  return productName
    ? productName.toLowerCase().replace(/[^a-z0-9]+/g, '_')
    : null;
}

function makeCurrencyFormatter(currency: string) {
  return (cents: number) => {
    const d = cents / 100;
    const formatted = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(d >= 1000 ? d / 1000 : d);
    return d >= 1000 ? `${formatted}K` : formatted;
  };
}

const CustomTooltip = ({ active, payload, label, formatAmount }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className='rounded-lg border border-border bg-white px-3 py-2 shadow-md text-sm'>
      <p className='font-medium text-gray-900 mb-1'>{label}</p>
      {payload.map(
        (p: any) =>
          p.value > 0 && (
            <div key={p.dataKey} className='flex items-center gap-2'>
              <div
                className='w-2 h-2 rounded-full'
                style={{ background: p.color }}
              />
              <span className='text-gray-600'>{p.name}:</span>
              <span className='font-medium tabular-nums'>
                {formatAmount(p.value)}
              </span>
            </div>
          ),
      )}
    </div>
  );
};

export default function InvoicePacingChart({
  refreshKey = 0,
}: {
  refreshKey?: number;
}) {
  const { customer, metronomeContract, settings } = useConfigContext();
  const { t } = useTranslation();
  const currency = settings?.currency || 'usd';
  const formatAmount = useMemo(() => makeCurrencyFormatter(currency), [currency]);
  const metronomeCustomerId = getEffectiveMetronomeCustomerId(customer);

  const [breakdowns, setBreakdowns] = useState<any[]>([]);
  const [periodStart, setPeriodStart] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Tracks the last customer+refreshKey combo to distinguish hard resets from silent contract-date refinements.
  const prevHardKey = useRef('');
  const [selectedProduct, setSelectedProduct] = useState('all');
  const [selectedModel, setSelectedModel] = useState('all');
  const [selectedQuality, setSelectedQuality] = useState('all');

  const commitTotalCents = metronomeContract?.commitTotal ?? 0;
  const commitmentCents =
    commitTotalCents > 0
      ? commitTotalCents
      : (metronomeContract?.creditBalance?.totalAmount ?? 0);
  const commitmentLabel =
    commitTotalCents > 0 ? t('dashboard.usage_pacing.commitment') : t('dashboard.usage_pacing.credit_balance');

  useEffect(() => {
    if (!metronomeCustomerId) {
      setLoading(false);
      return;
    }

    // Hard-reset (skeleton + clear) only when customer or manual refresh changes.
    // When only metronomeContract?.startingAt refines (async ConfigContext load),
    // keep existing data visible and re-fetch silently to avoid the flash-then-disappear.
    const hardKey = `${metronomeCustomerId}:${refreshKey}`;
    const isHardReset = hardKey !== prevHardKey.current;
    prevHardKey.current = hardKey;

    if (isHardReset) {
      setLoading(true);
      setBreakdowns([]);
    }
    setError(null);

    const now = new Date();
    // Use the contract's actual start month so quickstart (1-month backdated) shows full history.
    const contractStart = metronomeContract?.startingAt
      ? new Date(metronomeContract.startingAt)
      : startOfMonth(now);
    const billingStart = startOfMonth(contractStart);
    setPeriodStart(billingStart);
    const startingOn = format(billingStart, "yyyy-MM-dd'T'00:00:00'Z'");
    const endingBefore = format(
      addDays(endOfMonth(now), 1),
      "yyyy-MM-dd'T'00:00:00'Z'",
    );

    fetchClient
      .get(
        `/api/metronome/customer/${metronomeCustomerId}/invoice-breakdowns`,
        {
          params: {
            starting_on: startingOn,
            ending_before: endingBefore,
            window_size: 'day',
          },
        },
      )
      .then(({ data }) => {
        const raw: any[] = data.data ?? [];
        setBreakdowns(raw);
      })
      .catch((err) => {
        const msg =
          err?.response?.data?.error ?? err?.message ?? 'Failed to load';
        console.error('[InvoicePacingChart]', msg);
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [metronomeCustomerId, refreshKey, metronomeContract?.startingAt]);

  const models = useMemo(() => {
    const set = new Set<string>();
    for (const bd of breakdowns)
      for (const li of bd.line_items ?? [])
        if (li.pricing_group_values?.model)
          set.add(li.pricing_group_values.model);
    return Array.from(set).sort();
  }, [breakdowns]);

  const products = useMemo(() => {
    const set = new Set<string>();
    for (const bd of breakdowns)
      for (const li of bd.line_items ?? []) {
        const p = productFromLineItemName(li.name ?? '');
        if (p) set.add(p);
      }
    return Array.from(set).sort();
  }, [breakdowns]);

  const qualities = useMemo(() => {
    const set = new Set<string>();
    for (const bd of breakdowns)
      for (const li of bd.line_items ?? [])
        if (li.pricing_group_values?.quality)
          set.add(li.pricing_group_values.quality);
    return Array.from(set).sort();
  }, [breakdowns]);

  const dailySpend = useMemo(() => {
    const map: Record<string, number> = {};
    for (const bd of breakdowns) {
      const dateKey = format(
        new Date(bd.breakdown_start_timestamp),
        'yyyy-MM-dd',
      );
      const dayTotal = (bd.line_items ?? [])
        .filter((li: any) => {
          if (li.type !== 'usage') return false;
          if (
            selectedProduct !== 'all' &&
            productFromLineItemName(li.name ?? '') !== selectedProduct
          )
            return false;
          if (
            selectedModel !== 'all' &&
            li.pricing_group_values?.model !== selectedModel
          )
            return false;
          if (
            selectedQuality !== 'all' &&
            li.pricing_group_values?.quality !== selectedQuality
          )
            return false;
          return true;
        })
        .reduce((s: number, li: any) => s + (li.total ?? 0), 0);
      map[dateKey] = (map[dateKey] ?? 0) + dayTotal;
    }
    return map;
  }, [breakdowns, selectedProduct, selectedModel, selectedQuality]);

  const chartData = useMemo(() => {
    if (!periodStart) return [];

    const now = new Date();
    const days = eachDayOfInterval({ start: periodStart, end: endOfMonth(now) });
    const todayKey = format(now, 'yyyy-MM-dd');
    const todayIdx = days.findIndex(
      (d) => format(d, 'yyyy-MM-dd') === todayKey,
    );

    let cumulative = 0;
    return days.map((day, i) => {
      const key = format(day, 'yyyy-MM-dd');
      if (todayIdx === -1 || i <= todayIdx) cumulative += dailySpend[key] ?? 0;

      const point: any = {
        date: format(day, 'MMM d'),
        spend: todayIdx === -1 || i <= todayIdx ? cumulative : null,
      };
      if (todayIdx >= 0 && i >= todayIdx) {
        point.projected =
          cumulative + (cumulative / (todayIdx + 1)) * (i - todayIdx);
      }
      return point;
    });
  }, [dailySpend, periodStart]);

  const stats = useMemo(() => {
    const todayKey = format(new Date(), 'MMM d');
    const currentSpend = chartData.find((p) => p.date === todayKey)?.spend ?? 0;
    const projectedEnd =
      chartData[chartData.length - 1]?.projected ?? currentSpend;
    const filtersAreAll =
      selectedProduct === 'all' &&
      selectedModel === 'all' &&
      selectedQuality === 'all';
    const compareToCommit = commitmentCents > 0 && filtersAreAll;
    const pctUsed = compareToCommit ? (currentSpend / commitmentCents) * 100 : 0;
    return { currentSpend, projectedEnd, pctUsed };
  }, [
    chartData,
    commitmentCents,
    selectedProduct,
    selectedModel,
    selectedQuality,
  ]);

  if (loading) {
    return (
      <Card className='bg-white'>
        <CardHeader>
          <Skeleton className='h-5 w-48' />
          <Skeleton className='h-4 w-64 mt-1' />
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-3 gap-4 mb-6'>
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className='h-16 w-full rounded-lg' />
            ))}
          </div>
          <Skeleton className='h-[280px] w-full' />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className='bg-white'>
        <CardContent className='pt-6'>
          <div className='rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'>
            <strong>{t('dashboard.usage_pacing.error_load')}</strong> {error}
          </div>
        </CardContent>
      </Card>
    );
  }

  // No periodStart means no Metronome contract — nothing to show.
  if (!periodStart) return null;

  const filtersAreAll =
    selectedProduct === 'all' &&
    selectedModel === 'all' &&
    selectedQuality === 'all';
  /** Commitment line only when viewing all products/models/qualities (full invoice scope). */
  const showCommitmentComparison = commitmentCents > 0 && filtersAreAll;

  const onTrack = commitmentCents > 0
    ? stats.projectedEnd <= commitmentCents
    : true;

  return (
    <Card className='bg-white'>
      <CardHeader>
        <div className='flex flex-nowrap items-start justify-between gap-4'>
          <div className='min-w-0 flex-1 pr-2'>
            <CardTitle className='flex items-center gap-2'>
              <TrendingUp
                className='h-6 w-6 shrink-0 text-gray-900'
                aria-hidden
              />
              {t('dashboard.usage_pacing.title')}
            </CardTitle>
            <CardDescription>
              {t('dashboard.usage_pacing.description')}
            </CardDescription>
          </div>
          <div className='flex shrink-0 flex-nowrap items-center gap-2 self-start'>
            <select
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
              className='rounded-md border border-border bg-white px-2 py-1 text-xs text-gray-700'
            >
              <option value='all'>{t('dashboard.usage_pacing.all_products')}</option>
              {products.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className='rounded-md border border-border bg-white px-2 py-1 text-xs text-gray-700'
            >
              <option value='all'>{t('dashboard.usage_pacing.all_models')}</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={selectedQuality}
              onChange={(e) => setSelectedQuality(e.target.value)}
              className='rounded-md border border-border bg-white px-2 py-1 text-xs text-gray-700'
            >
              <option value='all'>
                {t('dashboard.usage_pacing.all_qualities', 'All qualities')}
              </option>
              {qualities.map((quality) => (
                <option key={quality} value={quality}>
                  {quality}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div
          className={`grid gap-4 mt-4 ${showCommitmentComparison ? 'grid-cols-3' : 'grid-cols-2'}`}
        >
          <div className='rounded-lg bg-gray-50 border border-border px-4 py-3'>
            <p className='text-xs text-muted-foreground'>{t('dashboard.usage_pacing.month_to_date')}</p>
            <p className='text-lg font-bold tabular-nums'>
              {formatAmount(stats.currentSpend)}
            </p>
            {showCommitmentComparison && (
              <p className='text-xs text-muted-foreground'>
                {t('dashboard.usage_pacing.pct_of_monthly', { pct: stats.pctUsed.toFixed(1), label: commitmentLabel.toLowerCase() })}
              </p>
            )}
          </div>
          {showCommitmentComparison && (
            <div className='rounded-lg bg-gray-50 border border-border px-4 py-3'>
              <p className='text-xs text-muted-foreground'>
                {t('dashboard.usage_pacing.monthly_label', { label: commitmentLabel.toLowerCase() })}
              </p>
              <p className='text-lg font-bold tabular-nums'>
                {formatAmount(commitmentCents)}
              </p>
              <p className='text-xs text-muted-foreground'>{t('dashboard.usage_pacing.prepaid_period')}</p>
            </div>
          )}
          <div
            className={`rounded-lg border px-4 py-3 ${showCommitmentComparison ? (onTrack ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200') : 'bg-gray-50 border-border'}`}
          >
            <p className='text-xs text-muted-foreground'>{t('dashboard.usage_pacing.projected_month_end')}</p>
            <p
              className={`text-lg font-bold tabular-nums ${showCommitmentComparison ? (onTrack ? 'text-green-700' : 'text-red-700') : ''}`}
            >
              {formatAmount(stats.projectedEnd)}
            </p>
            {showCommitmentComparison && (
              <p className={`text-xs ${onTrack ? 'text-green-600' : 'text-red-600'}`}>
                {onTrack ? t('dashboard.usage_pacing.within_prepaid') : t('dashboard.usage_pacing.above_prepaid')}
              </p>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <ResponsiveContainer width='100%' height={280}>
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
          >
            <defs>
              <linearGradient id='ipSpend' x1='0' y1='0' x2='0' y2='1'>
                <stop offset='5%' stopColor={PURPLE} stopOpacity={0.15} />
                <stop offset='95%' stopColor={PURPLE} stopOpacity={0} />
              </linearGradient>
              <linearGradient id='ipProj' x1='0' y1='0' x2='0' y2='1'>
                <stop offset='5%' stopColor={BLUE} stopOpacity={0.1} />
                <stop offset='95%' stopColor={BLUE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray='3 3'
              stroke={GRAY}
              vertical={false}
            />
            <XAxis
              dataKey='date'
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: '#9CA3AF' }}
              interval={Math.floor(chartData.length / 6)}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: '#9CA3AF' }}
              tickFormatter={(v) => formatAmount(v)}
              domain={[
                0,
                Math.max((commitmentCents || 0) * 1.1, stats.projectedEnd * 1.1),
              ]}
              width={52}
            />
            <Tooltip content={<CustomTooltip formatAmount={formatAmount} />} />
            <Legend
              iconType='circle'
              iconSize={8}
              wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
            />
            {showCommitmentComparison && (
              <ReferenceLine
                y={commitmentCents}
                stroke={onTrack ? GREEN : RED}
                strokeDasharray='6 3'
                strokeWidth={1.5}
                label={{
                  value: t('dashboard.usage_pacing.commitment_cap', { label: commitmentLabel.toLowerCase(), amount: formatAmount(commitmentCents) }),
                  position: 'insideTopRight',
                  fontSize: 11,
                  fill: onTrack ? GREEN : RED,
                }}
              />
            )}
            <Area
              type='linear'
              dataKey='spend'
              name={t('dashboard.usage_pacing.series_spend')}
              stroke={PURPLE}
              strokeWidth={2}
              fill='url(#ipSpend)'
              dot={false}
              activeDot={{ r: 4, fill: PURPLE }}
            />
            <Area
              type='linear'
              dataKey='projected'
              name={t('dashboard.usage_pacing.series_projected')}
              stroke={BLUE}
              strokeDasharray='5 3'
              strokeWidth={1.5}
              fill='url(#ipProj)'
              dot={false}
              activeDot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
