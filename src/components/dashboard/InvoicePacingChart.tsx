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
import {
  formatMetronomeAmount,
  isCustomMetronomeCreditType,
} from '@/utils/metronomeAmount';
import { GENERATION_SERVICE_TIER_PROPERTY } from '@/config/generationCatalog';
import { resolveMetronomeUsageBudget } from '@/utils/metronomeUsageBudget';
import { currentMetronomeMonthlyPeriod } from '@/utils/metronomeBillingPeriod';

const PURPLE = '#7C3AED';
const GREEN = '#10B981';
const AMBER = '#F59E0B';
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
  const { customer, metronomeContract, settings, demoMode } =
    useConfigContext();
  const { t } = useTranslation();
  const currency = settings?.currency || 'usd';
  const formatAmount = useMemo(
    () => (amount: number) =>
      formatMetronomeAmount(
        amount,
        metronomeContract?.creditTypeName,
        settings?.language,
        currency,
      ),
    [currency, metronomeContract?.creditTypeName, settings?.language],
  );
  const formatAxisAmount = useMemo(
    () => (amount: number) =>
      isCustomMetronomeCreditType(metronomeContract?.creditTypeName)
        ? new Intl.NumberFormat(settings?.language || 'en', {
            maximumFractionDigits: 1,
          }).format(amount)
        : formatAmount(amount),
    [formatAmount, metronomeContract?.creditTypeName, settings?.language],
  );
  const metronomeCustomerId = getEffectiveMetronomeCustomerId(customer);

  const [breakdowns, setBreakdowns] = useState<any[]>([]);
  const [periodStart, setPeriodStart] = useState<Date | null>(null);
  const [periodEnd, setPeriodEnd] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Tracks the last customer+refreshKey combo to distinguish hard resets from silent contract-date refinements.
  const prevHardKey = useRef('');
  const [selectedProduct, setSelectedProduct] = useState('all');
  const [selectedModel, setSelectedModel] = useState('all');
  const [selectedQuality, setSelectedQuality] = useState('all');
  const [selectedServiceTier, setSelectedServiceTier] = useState('all');

  const isB2BContract = /b2b|power user/i.test(metronomeContract?.name ?? '');
  const usageBudget = resolveMetronomeUsageBudget(metronomeContract);
  const commitTotalCents = usageBudget.contractTermCommitTotal;
  const monthlySeatCreditCents = usageBudget.monthlySeatCreditTotal;
  const sharedCommitAvailableCents = usageBudget.contractTermCommitAvailable;
  const planBudgetCents = usageBudget.amount;
  const topUpAvailableCents = usageBudget.addOnAvailable;
  const pacingBudgetLabel =
    usageBudget.kind === 'monthly-seat-credits'
      ? t('dashboard.usage_pacing.monthly_seat_credits')
      : usageBudget.kind === 'prepaid-commitment'
        ? t('dashboard.usage_pacing.prepaid_commitment')
        : t('dashboard.usage_pacing.monthly_credit_balance');
  const showSharedCommitmentCard =
    isB2BContract && commitTotalCents > 0 && monthlySeatCreditCents > 0;

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
    const billingPeriod = currentMetronomeMonthlyPeriod(
      metronomeContract?.startingAt,
      now,
    );
    setPeriodStart(billingPeriod.startingAt);
    setPeriodEnd(billingPeriod.endingBefore);
    const startingOn = billingPeriod.startingAt.toISOString();
    const endingBefore = billingPeriod.endingBefore.toISOString();

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
        if (li.type === 'usage' && li.pricing_group_values?.model)
          set.add(li.pricing_group_values.model);
    return Array.from(set).sort();
  }, [breakdowns]);

  const products = useMemo(() => {
    const set = new Set<string>();
    for (const bd of breakdowns)
      for (const li of bd.line_items ?? []) {
        if (li.type !== 'usage') continue;
        const p = productFromLineItemName(li.name ?? '');
        if (p) set.add(p);
      }
    return Array.from(set).sort();
  }, [breakdowns]);

  const qualities = useMemo(() => {
    const set = new Set<string>();
    const dimension = demoMode === 'generation' ? 'quality' : 'processing_tier';
    for (const bd of breakdowns)
      for (const li of bd.line_items ?? [])
        if (li.type === 'usage' && li.pricing_group_values?.[dimension])
          set.add(li.pricing_group_values[dimension]);
    return Array.from(set).sort();
  }, [breakdowns, demoMode]);

  const serviceTiers = useMemo(() => {
    if (demoMode !== 'generation') return [];
    const set = new Set<string>();
    for (const breakdown of breakdowns)
      for (const lineItem of breakdown.line_items ?? []) {
        const value =
          lineItem.pricing_group_values?.[GENERATION_SERVICE_TIER_PROPERTY];
        if (lineItem.type === 'usage' && value) set.add(value);
      }
    return Array.from(set).sort();
  }, [breakdowns, demoMode]);

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
            li.pricing_group_values?.[
              demoMode === 'generation' ? 'quality' : 'processing_tier'
            ] !== selectedQuality
          )
            return false;
          if (
            demoMode === 'generation' &&
            selectedServiceTier !== 'all' &&
            li.pricing_group_values?.[GENERATION_SERVICE_TIER_PROPERTY] !==
              selectedServiceTier
          )
            return false;
          return true;
        })
        .reduce((s: number, li: any) => s + (li.total ?? 0), 0);
      map[dateKey] = (map[dateKey] ?? 0) + dayTotal;
    }
    return map;
  }, [
    breakdowns,
    selectedProduct,
    selectedModel,
    selectedQuality,
    selectedServiceTier,
    demoMode,
  ]);

  const chartData = useMemo(() => {
    if (!periodStart || !periodEnd) return [];

    const now = new Date();
    const days = eachDayOfInterval({
      start: periodStart,
      end: addDays(periodEnd, -1),
    });
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
      return point;
    });
  }, [dailySpend, periodEnd, periodStart]);

  const stats = useMemo(() => {
    const todayKey = format(new Date(), 'MMM d');
    const currentSpend = chartData.find((p) => p.date === todayKey)?.spend ?? 0;
    return { currentSpend };
  }, [chartData]);

  const spendableBalanceCents =
    metronomeContract?.creditBalance.totalAvailable ?? 0;
  const pacingBudgetCents = isB2BContract
    ? planBudgetCents
    : Math.max(
        planBudgetCents,
        stats.currentSpend + spendableBalanceCents,
        planBudgetCents + topUpAvailableCents,
      );
  const pctUsed =
    pacingBudgetCents > 0 ? (stats.currentSpend / pacingBudgetCents) * 100 : 0;

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
    selectedQuality === 'all' &&
    selectedServiceTier === 'all';
  /** Budget comparison only when viewing the full, unfiltered invoice scope. */
  const showCommitmentComparison = pacingBudgetCents > 0 && filtersAreAll;
  const showTopUpCreditsCard = !isB2BContract && topUpAvailableCents > 0;
  const comparisonBudgetLabel = showTopUpCreditsCard
    ? t('dashboard.usage_pacing.credit_balance')
    : pacingBudgetLabel;
  const summaryCardCount =
    2 +
    (showCommitmentComparison ? 1 : 0) +
    (showTopUpCreditsCard ? 1 : 0) +
    (showSharedCommitmentCard ? 1 : 0);
  const summaryGridClass =
    summaryCardCount >= 5
      ? 'grid-cols-5'
      : summaryCardCount === 4
        ? 'grid-cols-4'
        : summaryCardCount === 3
          ? 'grid-cols-3'
          : 'grid-cols-2';

  const withinBudget =
    pacingBudgetCents > 0 ? stats.currentSpend <= pacingBudgetCents : true;
  const chartPeak = Math.max(stats.currentSpend, 1);
  const isTermCommitment = usageBudget.kind === 'prepaid-commitment';
  const showBudgetReferenceLine =
    showCommitmentComparison &&
    (!isTermCommitment || pacingBudgetCents <= chartPeak * 2.5);
  const yAxisMax = Math.max(
    chartPeak * 1.2,
    showBudgetReferenceLine ? pacingBudgetCents * 1.1 : 0,
  );

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
              {t(
                isB2BContract
                  ? 'dashboard.usage_pacing.description_b2b'
                  : commitTotalCents > 0
                    ? 'dashboard.usage_pacing.description_commit'
                    : 'dashboard.usage_pacing.description',
              )}
            </CardDescription>
          </div>
          <div className='flex shrink-0 flex-nowrap items-center gap-2 self-start'>
            <select
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
              className='rounded-md border border-border bg-white px-2 py-1 text-xs text-gray-700'
            >
              <option value='all'>
                {t('dashboard.usage_pacing.all_products')}
              </option>
              {products.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className='rounded-md border border-border bg-white px-2 py-1 text-xs text-gray-700'
            >
              <option value='all'>
                {t('dashboard.usage_pacing.all_models')}
              </option>
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
                {demoMode === 'generation'
                  ? t('dashboard.usage_pacing.all_qualities', 'All qualities')
                  : t('dashboard.usage_pacing.all_tiers', 'All tiers')}
              </option>
              {qualities.map((quality) => (
                <option key={quality} value={quality}>
                  {quality}
                </option>
              ))}
            </select>
            {demoMode === 'generation' && (
              <select
                value={selectedServiceTier}
                onChange={(e) => setSelectedServiceTier(e.target.value)}
                className='rounded-md border border-border bg-white px-2 py-1 text-xs text-gray-700'
              >
                <option value='all'>
                  {t('dashboard.usage_pacing.all_tiers', 'All service tiers')}
                </option>
                {serviceTiers.map((tier) => (
                  <option key={tier} value={tier}>
                    {tier}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className={`grid gap-4 mt-4 ${summaryGridClass}`}>
          <div className='rounded-lg bg-gray-50 border border-border px-4 py-3'>
            <p className='text-xs text-muted-foreground'>
              {t('dashboard.usage_pacing.month_to_date')}
            </p>
            <p className='text-lg font-bold tabular-nums'>
              {formatAmount(stats.currentSpend)}
            </p>
            {showCommitmentComparison && (
              <p className='text-xs text-muted-foreground'>
                {t('dashboard.usage_pacing.pct_of_budget', {
                  pct: pctUsed.toFixed(1),
                  label: comparisonBudgetLabel.toLowerCase(),
                })}
              </p>
            )}
          </div>
          {showCommitmentComparison && (
            <div className='rounded-lg bg-gray-50 border border-border px-4 py-3'>
              <p className='text-xs text-muted-foreground'>
                {pacingBudgetLabel}
              </p>
              <p className='text-lg font-bold tabular-nums'>
                {formatAmount(planBudgetCents)}
              </p>
              <p className='text-xs text-muted-foreground'>
                {t(
                  commitTotalCents > 0 && monthlySeatCreditCents === 0
                    ? 'dashboard.usage_pacing.prepaid_contract_term'
                    : 'dashboard.usage_pacing.available_this_period',
                )}
              </p>
            </div>
          )}
          {showTopUpCreditsCard && (
            <div className='rounded-lg border border-violet-200 bg-violet-50 px-4 py-3'>
              <p className='text-xs text-violet-700'>
                {t('modals.purchase_credits.top_up_credits_title')}
              </p>
              <p className='text-lg font-bold tabular-nums text-violet-950'>
                {formatAmount(topUpAvailableCents)}
              </p>
              <p className='text-xs text-violet-700'>
                {t('dashboard.usage_pacing.available_this_period')}
              </p>
            </div>
          )}
          <div className='rounded-lg border border-border bg-gray-50 px-4 py-3'>
            <p className='text-xs text-muted-foreground'>
              {t('dashboard.usage_pacing.credit_balance')}
            </p>
            <p className='text-lg font-bold tabular-nums'>
              {formatAmount(spendableBalanceCents)}
            </p>
            <p className='text-xs text-muted-foreground'>
              {t('dashboard.usage_pacing.available_this_period')}
            </p>
          </div>
          {showSharedCommitmentCard && (
            <div className='rounded-lg border border-border bg-gray-50 px-4 py-3'>
              <p className='text-xs text-muted-foreground'>
                {t('dashboard.usage_pacing.shared_commitment')}
              </p>
              <p className='text-lg font-bold tabular-nums'>
                {formatAmount(sharedCommitAvailableCents)}
              </p>
              <p className='text-xs text-muted-foreground'>
                {t('dashboard.usage_pacing.of_total', {
                  total: formatAmount(commitTotalCents),
                })}
              </p>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <ResponsiveContainer width='100%' height={280}>
          <AreaChart
            data={chartData}
            margin={{ top: 20, right: 10, left: 0, bottom: 4 }}
          >
            <defs>
              <linearGradient id='ipSpend' x1='0' y1='0' x2='0' y2='1'>
                <stop offset='5%' stopColor={PURPLE} stopOpacity={0.15} />
                <stop offset='95%' stopColor={PURPLE} stopOpacity={0} />
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
              tickFormatter={(v) => formatAxisAmount(v)}
              domain={[0, yAxisMax]}
              width={44}
            />
            <Tooltip content={<CustomTooltip formatAmount={formatAmount} />} />
            <Legend
              iconType='circle'
              iconSize={8}
              wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
            />
            {showBudgetReferenceLine && (
              <ReferenceLine
                y={pacingBudgetCents}
                stroke={withinBudget ? GREEN : isB2BContract ? AMBER : RED}
                strokeDasharray='6 3'
                strokeWidth={1.5}
                label={{
                  value: t('dashboard.usage_pacing.commitment_cap', {
                    label: comparisonBudgetLabel,
                    amount: formatAmount(pacingBudgetCents),
                  }),
                  position: 'insideTopRight',
                  fontSize: 11,
                  fill: withinBudget ? GREEN : isB2BContract ? AMBER : RED,
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
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
