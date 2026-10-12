'use client';

import { Suspense, useEffect, useState } from 'react';
import { useConfigContext } from '@/contexts/ConfigContext';
import Billing from '@/components/dashboard/Billing';
import { useTranslation } from 'react-i18next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export const dynamic = 'force-dynamic';

function DashboardPageContent() {
  const { customer } = useConfigContext();
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const creditsFromParam = searchParams.get('creditsFrom');
  const [creditsAnimationFrom] = useState<number | undefined>(() => {
    const parsed = creditsFromParam == null ? NaN : Number(creditsFromParam);
    return Number.isFinite(parsed) ? parsed : undefined;
  });

  useEffect(() => {
    if (creditsFromParam != null) {
      router.replace(pathname, { scroll: false });
    }
  }, [creditsFromParam, pathname, router]);

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
