'use client';

import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';
import {
  payAsYouGoProducts,
  type PaygProvider,
} from '@/data/payAsYouGoPricing';
import { useConfigContext } from '@/contexts/ConfigContext';
import { formatPrice } from '@/utils/helpers';

function ProviderMark({ provider }: { provider: PaygProvider }) {
  if (provider === 'lora_mythic') {
    return (
      <span
        className='inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600'
        aria-hidden
      >
        <Sparkles className='h-5 w-5' strokeWidth={1.75} aria-hidden />
      </span>
    );
  }
  return (
    <span
      className='inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700'
      aria-hidden
    >
      <svg viewBox='0 0 24 24' className='h-5 w-5' fill='none' aria-hidden>
        <circle
          cx='9.5'
          cy='12'
          r='4.5'
          stroke='currentColor'
          strokeWidth='1.75'
        />
        <circle
          cx='14.5'
          cy='12'
          r='4.5'
          stroke='currentColor'
          strokeWidth='1.75'
        />
      </svg>
    </span>
  );
}

export default function PayAsYouGoPricingTable() {
  const { t } = useTranslation();
  const { settings } = useConfigContext();
  const currency = settings?.currency || 'usd';
  const language = settings?.language || 'en';
  const fmt = (v: number) => formatPrice(v * 100, language, currency);

  return (
    <div className='mt-10 space-y-10 text-left text-gray-900'>
      {payAsYouGoProducts.map((product) => (
        <section
          key={product.id}
          aria-labelledby={`payg-${product.id}-heading`}
        >
          <Card>
            <CardContent className='overflow-hidden p-0'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b border-gray-100 bg-gray-50/80'>
                    <th
                      id={`payg-${product.id}-heading`}
                      scope='colgroup'
                      colSpan={3}
                      className='px-4 py-3.5 text-left text-lg font-semibold tracking-tight text-gray-900'
                    >
                      {product.name}
                    </th>
                  </tr>
                  <tr className='bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500'>
                    <th className='px-4 py-3 font-semibold'>
                      {t('dashboard.billing_payg.col_model')}
                    </th>
                    <th className='w-28 px-4 py-3 text-right font-semibold sm:w-32'>
                      {t('dashboard.billing_payg.col_input')}
                    </th>
                    <th className='w-28 px-4 py-3 text-right font-semibold sm:w-32'>
                      {t('dashboard.billing_payg.col_output')}
                    </th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-gray-100 bg-white'>
                  {product.models.map((row) => (
                    <tr
                      key={`${product.id}-${row.modelName}`}
                      className='transition-colors hover:bg-gray-50/70'
                    >
                      <td className='px-4 py-3'>
                        <div className='flex items-center gap-3'>
                          <ProviderMark provider={row.provider} />
                          <span className='font-medium text-gray-900'>
                            {row.modelName}
                          </span>
                        </div>
                      </td>
                      <td className='px-4 py-3 text-right align-middle'>
                        <span className='tabular-nums text-sm font-semibold text-gray-900'>
                          {fmt(row.inputUsdPerMillion)}
                        </span>
                      </td>
                      <td className='px-4 py-3 text-right align-middle'>
                        <span className='tabular-nums text-sm font-semibold text-gray-900'>
                          {fmt(row.outputUsdPerMillion)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </section>
      ))}
    </div>
  );
}
