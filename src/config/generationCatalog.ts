import {
  METRONOME_CATALOG,
  METRONOME_CREDIT_USD,
  packageByKey,
} from '@/config/metronomeCatalog';

export type GenerationModality = 'image' | 'video' | '3d';
export type GenerationServiceTier = 'standard' | 'priority';

export interface GenerationSku {
  id: string;
  modality: GenerationModality;
  operation: string;
  label: string;
  description: string;
  model: string;
  quality: 'standard' | 'ultra';
  unit: 'job' | 'second';
  quantity: number;
  credits: number;
}

export interface GenerationPlan {
  id: 'free' | 'pro' | 'enterprise';
  name: string;
  monthlyPrice: number | null;
  includedCredits: number | null;
  seatsIncluded?: number;
  additionalSeatPrice?: number;
  description: string;
}

export const GENERATION_CREDIT_USD = METRONOME_CREDIT_USD;
export const GENERATION_EVENT_TYPE = METRONOME_CATALOG.eventType;
export const GENERATION_SERVICE_TIER_PROPERTY =
  METRONOME_CATALOG.pricingDimension.propertyKey;
export const GENERATION_SERVICE_TIERS =
  METRONOME_CATALOG.pricingDimension.values as Array<{
    value: GenerationServiceTier;
    multiplier: number;
  }>;

export function generationCreditsForTier(
  sku: GenerationSku,
  serviceTier: GenerationServiceTier,
): number {
  const multiplier =
    GENERATION_SERVICE_TIERS.find((tier) => tier.value === serviceTier)
      ?.multiplier ?? 1;
  return sku.credits * multiplier;
}

const SKU_PRESENTATION: Record<
  string,
  Pick<GenerationSku, 'id' | 'label' | 'description'>
> = {
  'image:standard': {
    id: 'image-standard',
    label: 'Concept image',
    description: 'A production-ready concept image at standard resolution.',
  },
  'image:ultra': {
    id: 'image-ultra',
    label: 'Ultra image set',
    description: 'Four high-resolution variations for campaign and product work.',
  },
  'video:standard': {
    id: 'video-standard',
    label: '10-second video',
    description: 'A ten-second 1080p video with camera motion.',
  },
  'video:ultra': {
    id: 'video-ultra',
    label: '10-second cinematic video',
    description: 'A ten-second cinematic clip with enhanced temporal consistency.',
  },
  '3d:standard': {
    id: '3d-standard',
    label: 'Standard 3D asset',
    description: 'A textured 3D asset prepared for real-time workflows.',
  },
  '3d:ultra': {
    id: '3d-ultra-bundle',
    label: 'Ultra 3D production bundle',
    description: 'Ultra geometry, 4K textures, smart topology, and export formats.',
  },
};

export const GENERATION_SKUS: GenerationSku[] = METRONOME_CATALOG.rates.map(
  (rate) => {
    const presentation =
      SKU_PRESENTATION[`${rate.metric}:${rate.quality}`];
    const quantity = rate.metric === 'video' ? 10 : 1;
    return {
      ...presentation,
      modality: rate.metric as GenerationModality,
      operation: rate.operation,
      model: rate.model,
      quality: rate.quality as 'standard' | 'ultra',
      unit: rate.metric === 'video' ? 'second' : 'job',
      quantity,
      credits: rate.creditsPerUnit * quantity,
    };
  },
);

const freePackage = packageByKey('free')!;
const proPackage = packageByKey('pro')!;
const enterprisePackage = packageByKey('quickstart')!;
const requireNumber = (value: number | undefined, field: string) => {
  if (value === undefined) {
    throw new Error(`Canonical Metronome catalog is missing ${field}`);
  }
  return value;
};

export const GENERATION_PLANS: GenerationPlan[] = [
  {
    id: 'free',
    name: 'Free',
    monthlyPrice: 0,
    includedCredits: requireNumber(
      freePackage.includedCredits,
      'free.includedCredits',
    ),
    description: 'Two production-quality generation bundles to try Lora.',
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPrice:
      requireNumber(proPackage.monthlyPriceCents, 'pro.monthlyPriceCents') /
      100,
    includedCredits: requireNumber(
      proPackage.monthlyCredits,
      'pro.monthlyCredits',
    ),
    description: 'For individual creators shipping every week.',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyPrice: null,
    includedCredits: null,
    seatsIncluded: 5,
    description: 'Custom commitments, seat allocations, and negotiated rates.',
  },
];

export const QUICKSTART_ENTERPRISE_TERMS = {
  termMonths: enterprisePackage.durationMonths,
  prepaidCommitmentUsd:
    requireNumber(
      enterprisePackage.prepaidInvoiceCents,
      'quickstart.prepaidInvoiceCents',
    ) / 100,
  prepaidCommitmentCredits: requireNumber(
    enterprisePackage.includedCredits,
    'quickstart.includedCredits',
  ),
} as const;

export interface GenerationUsageEventInput {
  taskId: string;
  customerId: string;
  sku: GenerationSku;
  userId: string;
  workspaceId: string;
  projectId: string;
  serviceTier?: GenerationServiceTier;
  timestamp?: string;
}

export function buildGenerationUsageEvent(input: GenerationUsageEventInput) {
  const serviceTier = input.serviceTier ?? 'standard';
  const creditsConsumed = generationCreditsForTier(input.sku, serviceTier);
  return {
    transactionId: `${input.taskId}:completed`,
    customerId: input.customerId,
    eventType: GENERATION_EVENT_TYPE,
    timestamp: input.timestamp ?? new Date().toISOString(),
    properties: {
      credits_consumed: creditsConsumed,
      quantity: input.sku.quantity,
      modality: input.sku.modality,
      operation: input.sku.operation,
      model: input.sku.model,
      quality: input.sku.quality,
      unit: input.sku.unit,
      user_id: input.userId,
      workspace_id: input.workspaceId,
      project_id: input.projectId,
      [GENERATION_SERVICE_TIER_PROPERTY]: serviceTier,
    },
  };
}
