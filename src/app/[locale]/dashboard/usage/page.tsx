'use client';

import { useState, useEffect, useRef } from 'react';
import InvoicePacingChart from '@/components/dashboard/InvoicePacingChart';
import ProjectUsageStorageBar from '@/components/dashboard/ProjectUsageStorageBar';
import fetchClient from '@/utils/fetchClient';
import { useConfigContext } from '@/contexts/ConfigContext';
import { getEffectiveMetronomeCustomerId } from '@/config/metronomeDefaults';
import Button from '@/components/ui/Button';
import AutoTopUpModal from '@/components/dashboard/cards/AutoTopUpModal';
import PurchaseCreditsModal from '@/components/settings/cards/PurchaseCreditsModal';
import MetronomeCreditCheckoutModal from '@/components/settings/cards/MetronomeCreditCheckoutModal';
import { useTranslation } from 'react-i18next';
import useDashboardData, {
  useInvalidateDashboard,
} from '@/components/dashboard/useDashboardData';
import { useUsageChartRefresh } from '@/contexts/UsageChartRefreshContext';

export default function UsagePage() {
  const {
    customer,
    plan,
    metronomeContract,
    updateCustomer,
    triggerMetronomeContractRefresh,
  } = useConfigContext();
  const { t } = useTranslation();
  const metronomeCustomerId = getEffectiveMetronomeCustomerId(customer);
  const [isDashboardLoading, dashboardData] = useDashboardData(false);
  const invalidateDashboard = useInvalidateDashboard();
  const { invoicePacingRefreshKey } = useUsageChartRefresh();

  const [isAutoTopUpModalOpen, setIsAutoTopUpModalOpen] = useState(false);
  const [isPurchaseCreditsModalOpen, setIsPurchaseCreditsModalOpen] =
    useState(false);
  const [isCheckoutCreditsModalOpen, setIsCheckoutCreditsModalOpen] =
    useState(false);
  const [isTopUpActionLoading, setIsTopUpActionLoading] = useState(false);
  const [topUpActionError, setTopUpActionError] = useState<string | null>(null);

  const autoTopUpEnabled = metronomeCustomerId
    ? Boolean(metronomeContract?.autoTopUp)
    : (dashboardData?.autoTopUp ?? false);
  const showCreditActions =
    !isDashboardLoading &&
    (metronomeCustomerId || (plan && !plan?.lookupKey?.includes('free')));

  const handleCreditsPurchased = () => {
    invalidateDashboard();
  };

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get(
      'credit_purchase_session_id',
    );
    if (!sessionId) return;

    let cancelled = false;
    const verifyHostedPurchase = async () => {
      try {
        for (let attempt = 0; attempt < 30 && !cancelled; attempt += 1) {
          const { data } = await fetchClient.get(
            `/api/stripe/metronome-credit-checkout?session_id=${encodeURIComponent(
              sessionId,
            )}`,
          );
          if (data.ready) {
            await triggerMetronomeContractRefresh();
            updateCustomer({ forceSubscriptionRepoll: new Date() });
            invalidateDashboard();
            const url = new URL(window.location.href);
            url.searchParams.delete('credit_purchase_session_id');
            window.history.replaceState({}, '', url);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 1_000));
        }
        if (!cancelled) {
          setTopUpActionError(
            t('modals.purchase_credits.checkout_commit_pending'),
          );
        }
      } catch (error: any) {
        if (!cancelled) {
          setTopUpActionError(
            error.response?.data?.error ||
              t('modals.purchase_credits.checkout_verify_failed'),
          );
        }
      }
    };

    void verifyHostedPurchase();
    return () => {
      cancelled = true;
    };
  }, [invalidateDashboard, t, triggerMetronomeContractRefresh, updateCustomer]);

  const prevAutoTopUpOpen = useRef(false);
  useEffect(() => {
    if (prevAutoTopUpOpen.current && !isAutoTopUpModalOpen) {
      invalidateDashboard();
    }
    prevAutoTopUpOpen.current = isAutoTopUpModalOpen;
  }, [isAutoTopUpModalOpen, invalidateDashboard]);

  const handleCancelAutoTopUp = async () => {
    if (!metronomeCustomerId && !customer?.stripeCustomerId) return;
    setIsTopUpActionLoading(true);
    setTopUpActionError(null);
    try {
      if (metronomeCustomerId) {
        await fetchClient.delete('/api/metronome/notifications', {
          data: { metronomeCustomerId },
        });
        await triggerMetronomeContractRefresh();
      } else {
        await fetchClient.delete('/api/stripe/auto-top-up', {
          data: { customerId: customer?.stripeCustomerId },
        });
      }
      invalidateDashboard();
    } catch (error: any) {
      console.error('Failed to cancel auto top-up:', error);
      setTopUpActionError(
        error.response?.data?.error || 'Failed to cancel auto top-up.',
      );
    } finally {
      setIsTopUpActionLoading(false);
    }
  };

  return (
    <div className='flex-1 w-full space-y-8'>
      <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
        <div className='min-w-0'>
          <h1 className='text-2xl font-bold tracking-tight text-foreground sm:text-3xl'>
            {t('dashboard.usage.page_title')}
          </h1>
          <p className='mt-1 text-sm text-muted-foreground sm:text-base'>
            {t('dashboard.usage.page_description')}
          </p>
        </div>

        {showCreditActions && (
          <div className='flex shrink-0 justify-start lg:justify-end'>
            <div>
              <div className='inline-flex flex-wrap items-center gap-2'>
                <Button
                  text={
                    autoTopUpEnabled
                      ? t('dashboard.buttons.cancel_auto_topup')
                      : t('dashboard.buttons.setup_auto_topup')
                  }
                  onClick={
                    autoTopUpEnabled
                      ? handleCancelAutoTopUp
                      : () => setIsAutoTopUpModalOpen(true)
                  }
                  className={`${
                    autoTopUpEnabled
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-purple hover:bg-purple-hover text-button-color'
                  } h-9 w-auto min-w-0 shrink-0 px-4 py-0 text-sm font-semibold shadow-none ${
                    isTopUpActionLoading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  disabled={isTopUpActionLoading}
                />
                <Button
                  text={t('dashboard.buttons.purchase_credits')}
                  onClick={() => setIsPurchaseCreditsModalOpen(true)}
                  className='h-9 w-auto min-w-0 shrink-0 bg-purple px-4 py-0 text-sm font-semibold text-button-color shadow-none hover:bg-purple-hover'
                />
                <Button
                  text={t('modals.purchase_credits.checkout_flow')}
                  onClick={() => setIsCheckoutCreditsModalOpen(true)}
                  className='h-9 w-auto min-w-0 shrink-0 border border-purple bg-white px-4 py-0 text-sm font-semibold text-purple shadow-none hover:bg-purple-50'
                />
              </div>
              {topUpActionError && (
                <p className='mt-2 text-sm text-red-600'>{topUpActionError}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {showCreditActions && (
        <>
          <AutoTopUpModal
            open={isAutoTopUpModalOpen}
            setOpen={setIsAutoTopUpModalOpen}
          />
          <PurchaseCreditsModal
            open={isPurchaseCreditsModalOpen}
            setOpen={setIsPurchaseCreditsModalOpen}
            onCreditsPurchased={handleCreditsPurchased}
          />
          <MetronomeCreditCheckoutModal
            open={isCheckoutCreditsModalOpen}
            setOpen={setIsCheckoutCreditsModalOpen}
            onCreditsPurchased={handleCreditsPurchased}
          />
        </>
      )}

      <ProjectUsageStorageBar refreshKey={invoicePacingRefreshKey} />
      <InvoicePacingChart refreshKey={invoicePacingRefreshKey} />
    </div>
  );
}
