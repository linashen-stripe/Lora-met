'use client';

import { useTranslation } from 'react-i18next';
import { formatPrice } from '@/utils/helpers';

export type MetronomePackageSummary = {
  id?: string;
  name?: string;
  description?: string | null;
  price_cents?: number | null;
  subscriptions?: Array<{
    name?: string;
    subscription_rate?: { product?: { name?: string } };
  }>;
  commits?: Array<{
    name?: string;
    access_schedule?: {
      credit_type?: { name?: string };
      schedule_items?: Array<{
        amount?: number;
        duration?: { value?: string | number; unit?: string };
      }>;
    };
    invoice_schedule?: {
      schedule_items?: Array<{
        amount?: number;
        unit_price?: number;
        quantity?: number;
      }>;
    };
  }>;
};

export default function MetronomePackageCheckoutSidebar({
  pkg,
  language,
  currency,
  isLoading,
}: {
  pkg: MetronomePackageSummary | null;
  language?: string;
  currency?: string;
  isLoading: boolean;
}) {
  const { t } = useTranslation();

  const PACKAGE_NAME_TO_I18N_KEY: Record<string, string> = {
    premium: 'plans.premium.name',
    pro: 'subscription_pro.title',
    plus: 'subscription_plus.title',
    enterprise: 'subscription_team.title',
    enterpise: 'subscription_team.title',
    free: 'subscription_free.title',
  };

  function translatePackageName(name: string | undefined): string {
    const key = PACKAGE_NAME_TO_I18N_KEY[(name ?? '').trim().toLowerCase()];
    return key ? t(key) : (name?.trim() || t('subscribe_metronome_package.unknown_name'));
  }

  if (isLoading) {
    return (
      <div
        className='w-full space-y-5'
        aria-busy='true'
        aria-label={t('subscribe_metronome_package.loading')}
      >
        <div className='flex flex-col items-center space-y-2'>
          <div className='h-3 w-24 animate-pulse rounded bg-gray-200' />
          <div className='h-8 w-4/5 max-w-[280px] animate-pulse rounded bg-gray-200' />
        </div>
        <div className='flex flex-col items-center gap-2 pt-1'>
          <div className='h-4 w-24 animate-pulse rounded bg-gray-100' />
          <div className='h-5 w-32 animate-pulse rounded bg-gray-100' />
        </div>
      </div>
    );
  }

  if (!pkg) {
    return (
      <div className='rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-3 text-sm text-amber-950'>
        {t('subscribe_metronome_package.not_found')}
      </div>
    );
  }

  const priceCents =
    typeof pkg.price_cents === 'number' && Number.isFinite(pkg.price_cents)
      ? pkg.price_cents
      : null;
  const prepaidCommit = pkg.commits?.[0];
  const accessItem = prepaidCommit?.access_schedule?.schedule_items?.[0];
  const invoiceItem = prepaidCommit?.invoice_schedule?.schedule_items?.[0];
  const commitCredits = accessItem?.amount;
  const commitCreditType =
    prepaidCommit?.access_schedule?.credit_type?.name ?? 'credits';
  const prepaidInvoiceCents =
    invoiceItem?.amount ??
    ((invoiceItem?.unit_price ?? 0) * (invoiceItem?.quantity ?? 1) || null);

  return (
    <div className='w-full'>
      <div className='text-center'>
        <p className='text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500'>
          {t('subscribe_metronome_package.order_summary')}
        </p>
        <h2 className='mt-1.5 text-xl font-bold leading-snug tracking-tight text-gray-900'>
          {translatePackageName(pkg.name)}
        </h2>
        {pkg.description ? (
          <p className='mt-2 text-[13px] leading-relaxed text-gray-600'>
            {pkg.description}
          </p>
        ) : null}
      </div>

      <p className='mt-4 text-center font-semibold tabular-nums text-gray-900'>
        {priceCents !== null ? (
          <>
            {formatPrice(priceCents, language, currency)}
            {priceCents > 0 ? (
              <span className='ml-1 text-sm font-normal text-gray-500'>
                {t('subscribe_metronome_package.per_month')}
              </span>
            ) : null}
            <span className='ml-1 text-sm font-normal text-gray-500'>
              {t('subscribe_metronome_package.applicable_taxes')}
            </span>
          </>
        ) : (
          <>
            <span className='font-medium text-gray-600'>
              {t('subscribe_metronome_package.custom_pricing')}
            </span>
            <span className='ml-1 text-sm font-normal text-gray-500'>
              {t('subscribe_metronome_package.applicable_taxes')}
            </span>
          </>
        )}
      </p>

      {prepaidCommit && commitCredits != null && (
        <div className='mt-5 rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950'>
          <p className='font-semibold'>
            {prepaidCommit.name ?? 'Prepaid commitment'}
          </p>
          <p className='mt-1 tabular-nums'>
            {commitCredits.toLocaleString(language)} {commitCreditType}
          </p>
          {prepaidInvoiceCents != null && (
            <p className='mt-1 text-violet-800'>
              {formatPrice(prepaidInvoiceCents, language, currency)} due at
              contract start
            </p>
          )}
          {accessItem?.duration?.value && accessItem.duration.unit && (
            <p className='mt-1 text-xs text-violet-700'>
              Access period: {accessItem.duration.value}{' '}
              {accessItem.duration.unit.toLowerCase()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
