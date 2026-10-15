'use client';

import { Suspense, useEffect, useState } from 'react';
import { useConfigContext } from '@/contexts/ConfigContext';
import Billing from '@/components/dashboard/Billing';
import { useTranslation } from 'react-i18next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, LoaderCircle } from 'lucide-react';
import fetchClient from '@/utils/fetchClient';
import { getEffectiveMetronomeCustomerId } from '@/config/metronomeDefaults';

export const dynamic = 'force-dynamic';

function DashboardPageContent() {
  const {
    customer,
    demoMode,
    triggerMetronomeContractRefresh,
  } = useConfigContext();
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const creditsFromParam = searchParams.get('creditsFrom');
  const isSeedingUsage = searchParams.get('seedingUsage') === 'true';
  const [usageSeedState, setUsageSeedState] = useState<
    'pending' | 'completed' | 'failed' | null
  >(isSeedingUsage ? 'pending' : null);
  const [usageSeedError, setUsageSeedError] = useState<string | null>(null);
  const [creditsAnimationFrom] = useState<number | undefined>(() => {
    const parsed = creditsFromParam == null ? NaN : Number(creditsFromParam);
    return Number.isFinite(parsed) ? parsed : undefined;
  });

  useEffect(() => {
    if (creditsFromParam != null) {
      router.replace(pathname, { scroll: false });
    }
  }, [creditsFromParam, pathname, router]);

  useEffect(() => {
    const metronomeCustomerId = getEffectiveMetronomeCustomerId(customer);
    if (!isSeedingUsage || !metronomeCustomerId) return;

    let cancelled = false;
    let finished = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const pollSeedStatus = async () => {
      if (finished) return;
      try {
        const { data } = await fetchClient.get('/api/metronome/seed-status', {
          params: { customerId: metronomeCustomerId },
        });
        if (cancelled || !data.status) return;
        if (data.status.state === 'completed') {
          finished = true;
          setUsageSeedState('completed');
          await triggerMetronomeContractRefresh();
          refreshTimer = setTimeout(() => {
            const target = new URL(window.location.href);
            target.searchParams.delete('seedingUsage');
            window.location.replace(target.toString());
          }, 1200);
        } else if (data.status.state === 'failed') {
          finished = true;
          setUsageSeedState('failed');
          setUsageSeedError(
            data.status.message || 'Demo usage seeding failed.',
          );
        }
      } catch (error) {
        console.error('Failed to check demo usage seed status:', error);
      }
    };

    void pollSeedStatus();
    const interval = setInterval(() => void pollSeedStatus(), 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [
    customer,
    isSeedingUsage,
    triggerMetronomeContractRefresh,
  ]);

  const getDisplayName = () => {
    if (customer?.name) {
      const unprefixed = customer.name.replace(/^\[[^\]]+\]\s*/, '');
      return unprefixed.split(' ')[0];
    }
    if (customer?.email) {
      return customer.email.split('@')[0];
    }
    return 'there';
  };

  if (!customer || !customer.id) {
    return (
      <div className='text-center text-gray-500'>
        {t('dashboard.page.sign_in_required')}
      </div>
    );
  }

  return (
    <div className='container mx-auto w-full px-4 pb-8'>
      <div className='mb-8'>
        <h1 className='text-3xl font-bold tracking-tight text-foreground'>
          {t('dashboard.greeting', { name: getDisplayName() })}
        </h1>
        <p className='mt-2 text-muted-foreground'>
          {t('dashboard.page.description')}
        </p>
      </div>

      {usageSeedState && (
        <div
          className={`mb-6 flex items-start gap-3 rounded-xl border px-4 py-3 ${
            usageSeedState === 'failed'
              ? 'border-red-200 bg-red-50 text-red-900'
              : 'border-violet-200 bg-violet-50 text-violet-900'
          }`}
        >
          {usageSeedState === 'pending' ? (
            <LoaderCircle className='mt-0.5 h-5 w-5 shrink-0 animate-spin text-purple' />
          ) : usageSeedState === 'completed' ? (
            <CheckCircle2 className='mt-0.5 h-5 w-5 shrink-0 text-green-600' />
          ) : (
            <AlertCircle className='mt-0.5 h-5 w-5 shrink-0 text-red-600' />
          )}
          <div>
            <p className='font-semibold'>
              {usageSeedState === 'pending'
                ? 'Loading demo usage…'
                : usageSeedState === 'completed'
                  ? 'Demo usage is ready'
                  : 'Could not seed demo usage'}
            </p>
            <p className='mt-0.5 text-sm opacity-80'>
              {usageSeedState === 'pending'
                ? 'Historical usage is being sent to Metronome. Balances and charts will refresh automatically.'
                : usageSeedState === 'completed'
                  ? 'Refreshing Plans & Billing with the seeded data.'
                  : usageSeedError}
            </p>
          </div>
        </div>
      )}

      <Billing creditsAnimationFrom={creditsAnimationFrom} />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardPageContent />
    </Suspense>
  );
}
