'use client';

import { useTranslation } from 'react-i18next';
import { payAsYouGoProducts } from '@/data/payAsYouGoPricing';
import { useConfigContext } from '@/contexts/ConfigContext';
import { formatPrice } from '@/utils/helpers';
import UsagePricingMatrix, {
  type UsagePricingCategory,
} from '@/components/pricing/UsagePricingMatrix';

export default function PayAsYouGoPricingTable() {
  const { t } = useTranslation();
  const { settings } = useConfigContext();
  const currency = settings?.currency || 'usd';
  const language = settings?.language || 'en';
  const fmt = (v: number) => formatPrice(v * 100, language, currency);
  const unavailable = t('pricing_rates.not_available', 'Not available');
  const categories: UsagePricingCategory[] = payAsYouGoProducts.map(
    (product) => ({
      id: product.id,
      label: product.name,
      description: t(
        `pricing_rates.ai_builder.${product.id}.description`,
        product.id === 'chat'
          ? 'Token pricing for interactive conversations and agent workflows.'
          : product.id === 'code-assist'
            ? 'Token pricing for code generation, completion, and review.'
            : 'Token pricing for real-time voice input and generated audio.',
      ),
      rows: product.models.map((row) => ({
        id: `${product.id}-${row.modelName}`,
        name: row.modelName,
        details: [],
        billedAs: t('pricing_rates.per_million_tokens', 'Per 1M tokens'),
        prices: {
          standard: [
            {
              label: t('dashboard.billing_payg.col_input', 'Input'),
              value: fmt(row.inputUsdPerMillion),
            },
            {
              label: t('dashboard.billing_payg.col_output', 'Output'),
              value: fmt(row.outputUsdPerMillion),
            },
          ],
          batch:
            row.batchInputUsdPerMillion != null &&
            row.batchOutputUsdPerMillion != null
              ? [
                  {
                    label: t('dashboard.billing_payg.col_input', 'Input'),
                    value: fmt(row.batchInputUsdPerMillion),
                  },
                  {
                    label: t('dashboard.billing_payg.col_output', 'Output'),
                    value: fmt(row.batchOutputUsdPerMillion),
                  },
                ]
              : [{ value: unavailable }],
        },
      })),
    }),
  );

  return (
    <UsagePricingMatrix
      categories={categories}
      tiers={[
        {
          key: 'standard',
          label: t('pricing_rates.standard', 'Standard'),
          description: t(
            'pricing_rates.standard_processing',
            'Immediate processing',
          ),
        },
        {
          key: 'batch',
          label: t('pricing_rates.batch', 'Batch'),
          description: t(
            'pricing_rates.batch_processing',
            'Asynchronous discount',
          ),
        },
      ]}
      configurationLabel={t(
        'dashboard.billing_payg.col_model',
        'Model',
      )}
      billedAsLabel={t('pricing_rates.billed_as', 'Billed as')}
    />
  );
}
