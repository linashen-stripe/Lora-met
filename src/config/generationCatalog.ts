export type GenerationModality = 'image' | 'video' | '3d';

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
  id: 'free' | 'pro' | 'premium' | 'studio' | 'api' | 'enterprise';
  name: string;
  monthlyPrice: number | null;
  includedCredits: number | null;
  seatsIncluded?: number;
  additionalSeatPrice?: number;
  description: string;
}

export const GENERATION_CREDIT_USD = 0.01;
export const GENERATION_EVENT_TYPE = 'generation.completed';

export const GENERATION_SKUS: GenerationSku[] = [
  {
    id: 'image-standard',
    modality: 'image',
    operation: 'text_to_image',
    label: 'Concept image',
    description: 'A production-ready concept image at standard resolution.',
    model: 'lora-vision-2',
    quality: 'standard',
    unit: 'job',
    quantity: 1,
    credits: 10,
  },
  {
    id: 'image-ultra',
    modality: 'image',
    operation: 'text_to_image',
    label: 'Ultra image set',
    description: 'Four high-resolution variations for campaign and product work.',
    model: 'lora-vision-2',
    quality: 'ultra',
    unit: 'job',
    quantity: 1,
    credits: 50,
  },
  {
    id: 'video-standard',
    modality: 'video',
    operation: 'text_to_video',
    label: '10-second video',
    description: 'A ten-second 1080p video with camera motion.',
    model: 'lora-motion-1',
    quality: 'standard',
    unit: 'second',
    quantity: 10,
    credits: 50,
  },
  {
    id: 'video-ultra',
    modality: 'video',
    operation: 'image_to_video',
    label: '10-second cinematic video',
    description: 'A ten-second cinematic clip with enhanced temporal consistency.',
    model: 'lora-motion-1',
    quality: 'ultra',
    unit: 'second',
    quantity: 10,
    credits: 100,
  },
  {
    id: '3d-standard',
    modality: '3d',
    operation: 'image_to_3d',
    label: 'Standard 3D asset',
    description: 'A textured 3D asset prepared for real-time workflows.',
    model: 'lora-mesh-3',
    quality: 'standard',
    unit: 'job',
    quantity: 1,
    credits: 20,
  },
  {
    id: '3d-ultra-bundle',
    modality: '3d',
    operation: 'image_to_3d_with_texture',
    label: 'Ultra 3D production bundle',
    description: 'Ultra geometry, 4K textures, smart topology, and export formats.',
    model: 'lora-mesh-3',
    quality: 'ultra',
    unit: 'job',
    quantity: 1,
    credits: 50,
  },
];

export const GENERATION_PLANS: GenerationPlan[] = [
  {
    id: 'free',
    name: 'Free',
    monthlyPrice: 0,
    includedCredits: 100,
    description: 'Two production-quality generation bundles to try Lora.',
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: 20,
    includedCredits: 1_000,
    description: 'For individual creators shipping every week.',
  },
  {
    id: 'premium',
    name: 'Premium',
    monthlyPrice: 99,
    includedCredits: 8_000,
    description: 'For professional teams with sustained generation workloads.',
  },
  {
    id: 'studio',
    name: 'Studio',
    monthlyPrice: 70,
    includedCredits: 5_500,
    seatsIncluded: 1,
    additionalSeatPrice: 10,
    description: 'A shared workspace and credit pool for small studios.',
  },
  {
    id: 'api',
    name: 'API Pay as you go',
    monthlyPrice: null,
    includedCredits: null,
    description: 'Non-expiring prepaid API credits at $0.01 per credit.',
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
  termMonths: 12,
  prepaidCommitmentUsd: 100_000,
  seats: 5,
  monthlyCreditsPerSeat: 2_000,
  usageDiscountPercent: 15,
  usageMultiplier: 0.85,
} as const;

export interface GenerationUsageEventInput {
  taskId: string;
  customerId: string;
  sku: GenerationSku;
  userId: string;
  workspaceId: string;
  projectId: string;
  timestamp?: string;
}

export function buildGenerationUsageEvent(input: GenerationUsageEventInput) {
  return {
    transactionId: `${input.taskId}:completed`,
    customerId: input.customerId,
    eventType: GENERATION_EVENT_TYPE,
    timestamp: input.timestamp ?? new Date().toISOString(),
    properties: {
      credits_consumed: input.sku.credits,
      quantity: input.sku.quantity,
      modality: input.sku.modality,
      operation: input.sku.operation,
      model: input.sku.model,
      quality: input.sku.quality,
      unit: input.sku.unit,
      user_id: input.userId,
      workspace_id: input.workspaceId,
      project_id: input.projectId,
    },
  };
}
