'use client';

import { useTranslation } from 'react-i18next';
import { useConfigContext } from '@/contexts/ConfigContext';

export default function DashboardSettingsPage() {
  const { customer } = useConfigContext();
  const { t } = useTranslation();

  if (!customer || !customer.id) {
    return (
      <div className='text-center text-gray-500'>
        {t('dashboard.page.sign_in_required')}
      </div>
    );
  }

  return (
    <div className='container mx-auto w-full max-w-3xl px-4 pb-8'>
      <div className='mb-8'>
        <h1 className='text-3xl font-bold tracking-tight text-foreground'>
          {t('dashboard.settings.page_title')}
        </h1>
      </div>
    </div>
  );
}
