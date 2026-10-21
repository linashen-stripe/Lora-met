'use client';

import { useTranslation } from 'react-i18next';
import UsagePricingMatrix, {
  type UsagePricingCategory,
} from '@/components/pricing/UsagePricingMatrix';
import {
  generationCreditsForTier,
  GENERATION_SERVICE_TIERS,
  GENERATION_SKUS,
  type GenerationModality,
} from '@/config/generationCatalog';

const CATEGORY_COPY: Record<
  GenerationModality,
  { label: string; description: string }
> = {
  image: {
    label: 'Image',
    description:
      'Per-job credit pricing for concept images and high-resolution image sets.',
  },
  video: {
    label: 'Video',
    description:
      'Per-second credit pricing, shown here for the standard 10-second job.',
  },
  '3d': {
    label: '3D',
    description:
      'Per-job credit pricing for textured assets and production bundles.',
  },
};

export default function GenerationPricingTable() {
  const { t } = useTranslation();
  const categories: UsagePricingCategory[] = (
    ['image', 'video', '3d'] as GenerationModality[]
  ).map((modality) => ({
    id: modality,
    label: t(
      `pricing_rates.generation.${modality}.label`,
      CATEGORY_COPY[modality].label,
    ),
    description: t(
      `pricing_rates.generation.${modality}.description`,
      CATEGORY_COPY[modality].description,
    ),
    rows: GENERATION_SKUS.filter(
      (sku) => sku.modality === modality,
    ).map((sku) => ({
      id: sku.id,
      name: sku.label,
      details: [
        sku.model,
        sku.operation.replaceAll('_', ' '),
        sku.quality,
      ],
      billedAs: `${sku.quantity} ${sku.unit}${
        sku.quantity === 1 ? '' : 's'
      }`,
      prices: Object.fromEntries(
        GENERATION_SERVICE_TIERS.map((tier) => [
          tier.value,
          [
            {
              value: `${generationCreditsForTier(
                sku,
                tier.value,
              ).toLocaleString()} ${t('common.credits', 'credits')}`,
            },
          ],
        ]),
      ),
    })),
  }));

  return (
    <UsagePricingMatrix
      categories={categories}
      tiers={GENERATION_SERVICE_TIERS.map((tier) => ({
        key: tier.value,
        label:
          tier.value === 'priority'
            ? t('pricing_rates.priority', 'Priority')
            : t('pricing_rates.standard', 'Standard'),
        description: '',
      }))}
      configurationLabel={t(
        'pricing_rates.configuration',
        'Configuration',
      )}
      billedAsLabel={t('pricing_rates.billed_as', 'Billed as')}
    />
  );
}
