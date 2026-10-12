'use client';

import { useConfigContext } from '@/contexts/ConfigContext';
import { LoadingOverlay } from '@/components';
import useDashboardData from '@/components/dashboard/useDashboardData';
import UserSimulations from '@/components/dashboard/Simulations';
import { useTranslation } from 'react-i18next';

export default function UsagePage() {
  const { customer } = useConfigContext();
  const { t } = useTranslation();
  const [loading, dashboardData] = useDashboardData(true);

  // Fallback for no customer
  if (!customer || !customer.id) {
    return (
      <div className='text-center text-gray-500'>
        {t('dashboard.page.sign_in_required')}
      </div>
    );
  }

  return (
    <div className='container mx-auto px-4 pb-8 w-full'>
      <div>
        <h1 className='text-3xl font-bold mb-2'>
          {t('dashboard.simulations.page_title')}
        </h1>
        <p className='text-gray-600'>
          {t('dashboard.simulations.page_description')}
        </p>
      </div>

      {loading || !dashboardData ? (
        <LoadingOverlay />
      ) : (
        <UserSimulations
          meteredItems={dashboardData.meteredItems}
          billingCadence={dashboardData.billingCadence}
        />
      )}
    </div>
  );
}
