/**
 * Standalone replica of PayAsYouGoPricingTable + payAsYouGoPricing data (snapshot).
 * Copy this file as-is into another branch or repo; only requires:
 *   - `Card`, `CardContent` from your UI library (or replace with div + border/rounded-lg)
 *   - `lucide-react` Sparkles (Mythic/Spark lane icon)
 *
 * No i18n, no @/data import — values are hardcoded below.
 */
'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';
import { useConfigContext } from '@/contexts/ConfigContext';
import { formatPrice } from '@/utils/helpers';

type PaygProvider = 'lora_mythic' | 'lora_prime';

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
        <circle cx='9.5' cy='12' r='4.5' stroke='currentColor' strokeWidth='1.75' />
        <circle cx='14.5' cy='12' r='4.5' stroke='currentColor' strokeWidth='1.75' />
      </svg>
    </span>
  );
}

/** Snapshot from src/data/payAsYouGoPricing.ts — USD per million tokens */
const PAYG_PRODUCTS: {
  id: string;
  name: string;
  models: {
    provider: PaygProvider;
    modelName: string;
    inputUsdPerMillion: number;
    outputUsdPerMillion: number;
  }[];
}[] = [
  {
    id: 'code-assist',
    name: 'Code Assist',
    models: [
      {
        provider: 'lora_mythic',
        modelName: 'Lora Mythic 4.6',
        inputUsdPerMillion: 3.0,
        outputUsdPerMillion: 15.0,
      },
      {
        provider: 'lora_prime',
        modelName: 'Lora Prime Mini 5.4',
        inputUsdPerMillion: 0.75,
        outputUsdPerMillion: 4.5,
      },
    ],
  },
  {
    id: 'chat',
    name: 'Chat',
    models: [
      {
        provider: 'lora_mythic',
        modelName: 'Lora Mythic 4.6',
        inputUsdPerMillion: 3.0,
        outputUsdPerMillion: 15.0,
      },
      {
        provider: 'lora_prime',
        modelName: 'Lora Prime Mini 5.4',
        inputUsdPerMillion: 0.75,
        outputUsdPerMillion: 4.5,
      },
      {
        provider: 'lora_prime',
        modelName: 'Lora Prime 5.4',
        inputUsdPerMillion: 2.5,
        outputUsdPerMillion: 15.0,
      },
    ],
  },
  {
    id: 'voice',
    name: 'Voice',
    models: [
      {
        provider: 'lora_mythic',
        modelName: 'Lora Spark 4.5',
        inputUsdPerMillion: 1.0,
        outputUsdPerMillion: 5.0,
      },
      {
        provider: 'lora_prime',
        modelName: 'Lora Echo 1.5',
        inputUsdPerMillion: 32.0,
        outputUsdPerMillion: 64.0,
      },
    ],
  },
];

const COL_MODEL = 'Model';
const COL_INPUT = 'Input';
const COL_OUTPUT = 'Output';

export default function PayAsYouGoPricingTableReplica() {
  const { settings } = useConfigContext();
  const currency = settings?.currency || 'usd';
  const language = settings?.language || 'en';
  const fmt = (v: number) => formatPrice(v * 100, language, currency);
  return (
    <div className='mt-10 space-y-10 text-left text-gray-900'>
      {PAYG_PRODUCTS.map((product) => (
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
                    <th className='px-4 py-3 font-semibold'>{COL_MODEL}</th>
                    <th className='w-28 px-4 py-3 text-right font-semibold sm:w-32'>
                      {COL_INPUT}
                    </th>
                    <th className='w-28 px-4 py-3 text-right font-semibold sm:w-32'>
                      {COL_OUTPUT}
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
