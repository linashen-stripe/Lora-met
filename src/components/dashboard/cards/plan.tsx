import Link from 'next/link';
import { useConfigContext } from '@/contexts/ConfigContext';
import { getEffectiveMetronomeCustomerId } from '@/config/metronomeDefaults';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Card } from '@/components/ui/card';
import { ArrowUp, GitCompareArrows } from 'lucide-react';
import Skeleton from '@/components/ui/Skeleton';

interface PlanCardProps {
  isLoading?: boolean;
  /** When set (e.g. UBB dashboard), show this package name and omit the PAYG blurb. */
  displayPackageName?: string | null;
}

const translatePlanName = (name: string | null | undefined, t: TFunction): string | null | undefined => {
  if (!name) return name;
  const slug = name.toLowerCase().replace(/[\s-]+/g, '_');
  return t(`products.default_${slug}.name`, { defaultValue: name });
};

const PlanCard = ({ isLoading = false, displayPackageName = null }: PlanCardProps) => {
  const { plan, metronomeContract, settings, customer } = useConfigContext();
  const { t } = useTranslation();
  const isMetronomePayg = Boolean(getEffectiveMetronomeCustomerId(customer));
  const planName =
    translatePlanName(displayPackageName, t) ??
    translatePlanName(metronomeContract?.name, t) ??
    (isMetronomePayg ? t('dashboard.cards.pay_as_you_use') : translatePlanName(plan?.displayName, t));
  const showUpgradeButton =
    !isMetronomePayg && !metronomeContract && plan?.lookupKey?.includes('free');

  return (
    <Card className='bg-white h-full flex flex-col text-gray-900'>
      <div className='p-6 flex flex-row items-center justify-between space-y-0 pb-2'>
        <h3 className='tracking-tight text-base font-semibold'>
          {t('dashboard.cards.current_plan')}
        </h3>
        {isLoading ? (
          <Skeleton className='h-4 w-4 rounded-full' />
        ) : (
          <GitCompareArrows className='w-4 h-4 text-purple' />
        )}
      </div>
      <div className='p-6 pt-0 flex flex-col h-full'>
        {isLoading ? (
          <>
            <div className='text-3xl font-bold mb-3'>
              <Skeleton className='h-8 w-40' />
            </div>
            <div className='text-sm text-gray-600 mb-4'>
              <Skeleton className='h-4 w-32' />
            </div>
            <div className='mt-auto'>
              <Skeleton className='h-10 w-full rounded-md' />
            </div>
          </>
        ) : (
          <>
            <div className={showUpgradeButton ? 'mb-auto' : undefined}>
              <div className='text-2xl font-bold'>{planName}</div>
              {isMetronomePayg && !displayPackageName && (
                <p className='mt-2 text-sm leading-relaxed text-gray-600'>
                  {t('dashboard.cards.pay_as_you_use_description')}
                </p>
              )}
            </div>
            {showUpgradeButton && (
              <Link
                href={`/${settings?.language || 'en'}/pricing`}
                className='mt-4 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-purple-hover transition-colors duration-200'
              >
                <ArrowUp className='w-4 h-4' />
                {t('dashboard.cards.upgrade')}
              </Link>
            )}
          </>
        )}
      </div>
    </Card>
  );
};

export default PlanCard;
