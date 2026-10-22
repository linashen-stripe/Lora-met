import PlanCard from '@/components/dashboard/cards/plan';
import CreditsCard from '@/components/dashboard/cards/credits';
import BillingCard from '@/components/dashboard/cards/billing';
import MetronomeNextPaymentCard from '@/components/dashboard/cards/metronome-next-payment';
import PreviewInvoice from '@/components/dashboard/PreviewInvoice';
import MetronomePreviewInvoice from '@/components/dashboard/MetronomePreviewInvoice';
import InvoiceList from '@/components/dashboard/InvoiceList';
import PaymentMethod from '@/components/settings/cards/PaymentMethod';
import useDashboardData from '@/components/dashboard/useDashboardData';
import { Card } from '@/components/ui/card';
import Skeleton from '@/components/ui/Skeleton';
import { useConfigContext } from '@/contexts/ConfigContext';
import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import fetchClient from '@/utils/fetchClient';
import { MetronomeInvoice } from '@/utils/types';
import { getEffectiveMetronomeCustomerId } from '@/config/metronomeDefaults';
import {
  getMetronomeInvoiceUsageSubtotalCents,
  isMeteredUsageLineItem,
  pickMetronomeSpendInvoice,
} from '@/utils/metronomeInvoice';
import {
  extractBalanceFromGetNetBalanceResponse,
  metronomeNetBalanceToCents,
} from '@/utils/metronomeNetBalance';
import { readAiBuilderOptimisticBalance } from '@/utils/aiBuilderOptimisticBalance';


const Billing = ({ creditsAnimationFrom }: { creditsAnimationFrom?: number }) => {
  const [loading, dashboardData] = useDashboardData(false);
  const { plan, metronomeContract, metronomeContractLoaded, customer, settings } =
    useConfigContext();
  const { t } = useTranslation();
  const [metronomeInvoices, setMetronomeInvoices] = useState<MetronomeInvoice[] | null>(null);
  const [draftInvoice, setDraftInvoice] = useState<MetronomeInvoice | null>(null);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  /** Cents from Metronome `customerBalances/getNetBalance`; null if not loaded or error. */
  const [metronomeNetBalanceCents, setMetronomeNetBalanceCents] = useState<number | null>(
    null,
  );
  const [netBalanceLoaded, setNetBalanceLoaded] = useState(false);
  const [optimisticAiBalanceCents, setOptimisticAiBalanceCents] = useState<
    number | null
  >(null);

  useEffect(() => {
    const pending = readAiBuilderOptimisticBalance(customer?.id);
    const available = Number(pending?.availableBalanceCents);
    const pendingAt = pending?.pendingSpendAt
      ? new Date(pending.pendingSpendAt).getTime()
      : NaN;
    const pendingTtlMs = 60_000;
    const pendingAgeMs = Date.now() - pendingAt;
    const appliesToContract =
      !pending?.balanceContractId ||
      pending.balanceContractId === metronomeContract?.id;
    const shouldApply =
      appliesToContract &&
      Number(pending?.pendingSpendCents ?? 0) > 0 &&
      Number.isFinite(available) &&
      Number.isFinite(pendingAgeMs) &&
      pendingAgeMs >= 0 &&
      pendingAgeMs < pendingTtlMs;
    setOptimisticAiBalanceCents(shouldApply ? available : null);
    if (!shouldApply) return;
    const expiryTimer = setTimeout(
      () => setOptimisticAiBalanceCents(null),
      pendingTtlMs - pendingAgeMs,
    );
    return () => clearTimeout(expiryTimer);
  }, [customer?.id, metronomeContract?.id]);

  useEffect(() => {
    const metronomeId = getEffectiveMetronomeCustomerId(customer);
    if (!metronomeId) {
      setMetronomeNetBalanceCents(null);
      setNetBalanceLoaded(true);
      return;
    }

    let cancelled = false;

    const fetchNetBalance = () => {
      fetchClient
        .post(`/api/metronome/customer/${encodeURIComponent(metronomeId)}/net-balance`, {
          invoice_inclusion_mode: 'FINALIZED_AND_DRAFT',
          ...(metronomeContract?.creditTypeId
            ? { credit_type_id: metronomeContract.creditTypeId }
            : {}),
        })
        .then(({ data }) => {
          if (cancelled) return;
          const raw = extractBalanceFromGetNetBalanceResponse(data);
          const cents = metronomeNetBalanceToCents(raw);
          setMetronomeNetBalanceCents(cents ?? null);
        })
        .catch((err) => {
          console.error('Failed to fetch Metronome net balance:', err);
          if (!cancelled) setMetronomeNetBalanceCents(null);
        })
        .finally(() => {
          if (!cancelled) setNetBalanceLoaded(true);
        });
    };

    setNetBalanceLoaded(false);
    fetchNetBalance();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchNetBalance();
      }
    }, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    customer?.id,
    customer?.metronomeCustomerId,
    metronomeContract?.creditTypeId,
  ]);

  useEffect(() => {
    const metronomeCustomerId = getEffectiveMetronomeCustomerId(customer);
    if (!metronomeCustomerId) {
      setInvoicesLoading(false);
      setMetronomeInvoices(null);
      setDraftInvoice(null);
      return;
    }

    const fetchInvoices = async () => {
      const [allRes, draftRes] = await Promise.all([
        fetchClient.get(`/api/metronome/customer/${metronomeCustomerId}/invoices`),
        fetchClient.get(
          `/api/metronome/customer/${metronomeCustomerId}/invoices?status=DRAFT&sort=date_desc`,
        ),
      ]);

      const invoices: MetronomeInvoice[] = allRes.data.invoices ?? [];
      setMetronomeInvoices(invoices);

      const draftList: MetronomeInvoice[] = draftRes.data.invoices ?? [];
      // Keep invoice-derived balances inside the active contract boundary.
      // During Free → Pro, the finalized/open Free usage draft may still be the
      // only draft with usage; selecting it here would incorrectly turn
      // 2,000 Pro credits into 1,900 even though Metronome attributed it to Free.
      const spend = pickMetronomeSpendInvoice(
        invoices,
        draftList,
        metronomeContract?.id,
      );

      if (spend?.id) {
        // Use the list invoice directly — the retrieve endpoint returns no line_items.
        setDraftInvoice(spend);
      } else {
        setDraftInvoice(null);
      }
    };

    setInvoicesLoading(true);
    fetchInvoices()
      .catch((err) => {
        console.error('Failed to fetch Metronome invoices:', err);
        setMetronomeInvoices([]);
        setDraftInvoice(null);
      })
      .finally(() => setInvoicesLoading(false));

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchInvoices().catch((err) =>
          console.error('Failed to fetch Metronome invoices:', err),
        );
      }
    }, 5 * 60_000);
    return () => clearInterval(interval);
  }, [
    customer?.id,
    customer?.metronomeCustomerId,
    metronomeContract?.id,
  ]);

  useEffect(() => {
    if (optimisticAiBalanceCents == null || !metronomeContract) return;
    const contractAvailable =
      metronomeContract.creditBalance.totalAvailable ?? 0;
    const contractTotal = metronomeContract.creditBalance.totalAmount ?? 0;
    const hasUsage = Boolean(
      draftInvoice?.line_items?.some((line) =>
        isMeteredUsageLineItem(line.type),
      ),
    );
    const usageAmount = getMetronomeInvoiceUsageSubtotalCents(draftInvoice);
    const processedAvailable =
      hasUsage && contractTotal > 0
        ? Math.min(
            contractAvailable,
            Math.max(0, contractTotal - usageAmount),
          )
        : contractAvailable;
    if (processedAvailable <= optimisticAiBalanceCents) {
      setOptimisticAiBalanceCents(null);
    }
  }, [draftInvoice, metronomeContract, optimisticAiBalanceCents]);

  const isFree = plan?.lookupKey?.includes('free') || false;

  const previewInvoice = {
    data: dashboardData?.previewInvoice || null,
    isLoading: loading,
  };

  const hasMetronomeData = Boolean(metronomeContract);
  const hasStripeData = Boolean(plan && dashboardData);
  const hasMetronomeCustomer = Boolean(getEffectiveMetronomeCustomerId(customer));

  const showCreditsCard = !hasMetronomeCustomer;
  const showBillingCard = Boolean(hasStripeData && !isFree);
  const topRowCardCount =
    1 + (showCreditsCard ? 1 : 0) + (showBillingCard ? 1 : 0);
  const topRowGridClass =
    topRowCardCount >= 3
      ? 'md:grid-cols-3'
      : topRowCardCount === 2
        ? 'md:grid-cols-2'
        : 'md:grid-cols-1';

  const isStillLoading =
    (hasMetronomeCustomer && (!metronomeContractLoaded || !netBalanceLoaded)) ||
    (!hasMetronomeCustomer && loading);

  if (isStillLoading) {
    return (
      <div>
        {hasMetronomeCustomer ? (
          <div className='mb-8 grid grid-cols-1 gap-6 md:grid-cols-3'>
            <PlanCard isLoading />
            <Card className='flex h-full flex-col rounded-lg border shadow-sm bg-white'>
              <div className='flex flex-row items-center justify-between space-y-0 p-6 pb-2'>
                <h3 className='text-base font-semibold tracking-tight'>
                  {t('dashboard.ai_credits')}
                </h3>
                <Skeleton className='h-4 w-4 rounded-full' />
              </div>
              <div className='p-6 pt-0'>
                <Skeleton className='mb-3 h-8 w-36' />
                <Skeleton className='mb-2 h-4 w-full rounded-full' />
                <Skeleton className='h-4 w-full max-w-xs' />
              </div>
            </Card>
            <MetronomeNextPaymentCard invoice={null} isLoading />
          </div>
        ) : (
          <div className={`mb-8 grid gap-6 md:grid-cols-2`}>
            <PlanCard isLoading />
            <Card className='bg-white h-full flex flex-col'>
              <div className='p-6 flex flex-row items-center justify-between space-y-0 pb-2'>
                <h3 className='tracking-tight text-base font-semibold'>
                  {t('dashboard.ai_credits')}
                </h3>
                <Skeleton className='h-4 w-4 rounded-full' />
              </div>
              <div className='p-6 pt-0'>
                <div className='text-3xl font-bold mb-3'>
                  <Skeleton className='h-8 w-36' />
                </div>
                <div className='mb-2'>
                  <Skeleton className='h-3 w-full' />
                </div>
                <div className='mb-4'>
                  <Skeleton className='h-4 w-48' />
                </div>
              </div>
            </Card>
          </div>
        )}
        {hasMetronomeCustomer ? (
          <MetronomePreviewInvoice invoice={null} isLoading />
        ) : (
          <PreviewInvoice invoice={null} meteredItems={[]} isLoading={true} />
        )}
        <InvoiceList invoices={null} isLoading={true} />
      </div>
    );
  }

  const creditTotalAvailable = hasMetronomeData
    ? (metronomeContract?.creditBalance.totalAvailable ?? 0)
    : (dashboardData?.creditBalance?.total_available ?? 0);
  const creditTotalAmount = hasMetronomeData
    ? (metronomeContract?.creditBalance.totalAmount ?? 0)
    : (dashboardData?.creditBalance?.total_amount ?? 0);

  const mAvail = metronomeContract?.creditBalance.totalAvailable ?? 0;
  const mTotal = metronomeContract?.creditBalance.totalAmount ?? 0;
  const hasDraftUsageLines = Boolean(
    draftInvoice?.line_items?.some((line) =>
      isMeteredUsageLineItem(line.type),
    ),
  );
  const draftUsageAmount = getMetronomeInvoiceUsageSubtotalCents(draftInvoice);
  const invoiceDerivedAvailable =
    hasDraftUsageLines && mTotal > 0
      ? Math.max(0, mTotal - draftUsageAmount)
      : null;
  // Contract availability is breakdown-adjusted in ConfigContext. An explicit
  // draft usage value may lower it sooner, but stale invoice/net-balance reads
  // must never restore credit already consumed from a Metronome contract.
  const ubbAvailable = metronomeContract
    ? Math.max(
        0,
        Math.min(
          invoiceDerivedAvailable == null
            ? mAvail
            : Math.min(mAvail, invoiceDerivedAvailable),
          optimisticAiBalanceCents ?? Number.POSITIVE_INFINITY,
        ),
      )
    : Math.max(0, metronomeNetBalanceCents ?? 0);
  /** Total pool: if Metronome never populated schedule totals but we know remaining, treat as full bar. */
  const ubbTotal = mTotal > 0 ? mTotal : mAvail > 0 ? mAvail : 0;
  const ubbBalanceCurrency = settings?.currency ?? 'usd';

  return (
    <div>
      {hasMetronomeCustomer ? (
        <div className='mb-8 grid grid-cols-1 gap-6 md:grid-cols-3'>
          <PlanCard displayPackageName={metronomeContract?.name} />
          <CreditsCard
            totalAvailable={ubbAvailable}
            totalAmount={ubbTotal}
            creditBarVariant='remaining'
            balanceCurrency={ubbBalanceCurrency}
            creditTypeName={metronomeContract?.creditTypeName}
            autoTopUp={metronomeContract?.autoTopUp}
            animationFrom={creditsAnimationFrom}
          />
          <MetronomeNextPaymentCard
            invoice={draftInvoice}
            isLoading={invoicesLoading}
          />
        </div>
      ) : (
        <div className={`mb-8 grid ${topRowGridClass} gap-6`}>
          <PlanCard />
          {showCreditsCard && (
            <CreditsCard
              totalAvailable={creditTotalAvailable}
              totalAmount={creditTotalAmount}
            />
          )}
          {showBillingCard && (
            <BillingCard
              previewInvoice={previewInvoice.data}
              isLoading={previewInvoice.isLoading}
            />
          )}
        </div>
      )}
      {hasMetronomeCustomer ? (
        <MetronomePreviewInvoice
          invoice={draftInvoice}
          isLoading={invoicesLoading}
        />
      ) : (
        hasStripeData &&
        !isFree && (
          <PreviewInvoice
            invoice={previewInvoice.data}
            meteredItems={dashboardData?.meteredItems ?? []}
            isLoading={previewInvoice.isLoading}
          />
        )
      )}
      <PaymentMethod subscription={dashboardData?.subscription} />
      {hasMetronomeCustomer ? (
        <InvoiceList
          invoices={null}
          metronomeInvoices={metronomeInvoices}
          isLoading={invoicesLoading}
        />
      ) : (
        <InvoiceList
          invoices={dashboardData?.invoices ?? []}
          isLoading={loading}
        />
      )}
    </div>
  );
};

export default Billing;
