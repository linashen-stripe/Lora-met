'use client';

import { useConfigContext } from '@/contexts/ConfigContext';
import { formatPrice } from '@/utils/helpers';
import { useTranslation } from 'next-i18next';

export default function UsageBasedPricingSummary() {
  const { t } = useTranslation();
  const { settings } = useConfigContext();

  if (!settings) {
    return null;
  }

  return (
    <div className='bg-gray-100 p-4 rounded-md mb-6'>
      <div className='flex justify-between mb-2'>
        <span>{t('subscription_pro.subtotal')}</span>
        <span>
          {formatPrice(0, settings.language, settings.currency)} +{' '}
          {t('subscription_team.usage')}
        </span>
      </div>
      <div className='flex justify-between mb-2'>
        <span>{t('subscription_pro.tax')}</span>
        <span>{formatPrice(0, settings.language, settings.currency)}</span>
      </div>
      <div className='flex justify-between font-semibold'>
        <span>{t('subscription_pro.total')}</span>
        <span>
          {formatPrice(0, settings.language, settings.currency)} +{' '}
          {t('subscription_pro.usage_total')}
        </span>
      </div>
    </div>
  );
}
