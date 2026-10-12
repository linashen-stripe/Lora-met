'use client';

import { formatPrice } from '@/utils/helpers';
import { Card } from '@/components/ui/card';
import { Calendar } from 'lucide-react';
import Skeleton from '@/components/ui/Skeleton';
import { useConfigContext } from '@/contexts/ConfigContext';
import { useTranslation } from 'react-i18next';
import type { MetronomeInvoice } from '@/utils/types';

function creditTypeNameToCurrency(name: string): string {
  const match = name.match(/^([A-Z]+)/);
  return match ? match[1].toLowerCase() : 'usd';
}

export default function MetronomeNextPaymentCard({
  invoice,
  isLoading = false,
}: {
  invoice: MetronomeInvoice | null;
  isLoading?: boolean;
}) {
  const { settings } = useConfigContext();
  const { t } = useTranslation();
  const language = settings?.language || 'en';
  const currency = creditTypeNameToCurrency(invoice?.credit_type?.name ?? 'USD');

  const dueLabel =
    invoice?.end_timestamp &&
    t('dashboard.cards.next_invoice_due', {
      date: new Date(invoice.end_timestamp).toLocaleDateString(language, {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    });

  return (
    <Card className='bg-white h-full flex flex-col text-gray-900'>
      <div className='p-6 flex flex-row items-center justify-between space-y-0 pb-2'>
        <h3 className='tracking-tight text-base font-semibold'>
          {t('dashboard.cards.next_billing')}
        </h3>
        {isLoading ? (
          <Skeleton className='h-4 w-4 rounded-full' />
        ) : (
          <Calendar className='w-4 h-4 text-purple shrink-0' />
        )}
      </div>
      <div className='p-6 pt-0 flex flex-col h-full'>
        {isLoading ? (
          <>
            <div className='text-3xl font-bold mb-3'>
              <Skeleton className='h-8 w-32' />
            </div>
            <div className='text-sm text-gray-600'>
              <Skeleton className='h-4 w-40' />
            </div>
          </>
        ) : (
          <>
            <div className='text-3xl font-bold tabular-nums mb-2'>
              {invoice ? (
                formatPrice(invoice.total, language, currency)
              ) : (
                <span className='text-muted-foreground'>—</span>
              )}
            </div>
            <p className='text-sm text-gray-600'>
              {invoice
                ? t('dashboard.cards.next_metronome_invoice')
                : t('dashboard.cards.no_upcoming_invoice')}
            </p>
            {dueLabel ? (
              <p className='mt-2 text-xs text-muted-foreground'>{dueLabel}</p>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}
