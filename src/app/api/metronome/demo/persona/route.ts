import { NextRequest } from 'next/server';
import { normalizeDemoMode, type DemoMode } from '@/config/demoModes';
import {
  prepareGenerationPersona,
  type GenerationStarterPersona,
} from '@/server/metronomeStarter';
import {
  prepareAiBuilderPersona,
  type AiBuilderStarterPersona,
} from '@/server/aiBuilderStarter';
import { formatDemoCustomerName } from '@/utils/demoCustomerName';
import { ndjsonStreamResponse } from '@/utils/ndjsonStream';
import { withFallbackHeaders } from '@/utils/withFallbackHeaders';
import { deriveCustomerNameFromEmail } from '@/utils/helpers';
import type { DemoUsageStory } from '@/utils/demoUsageSeedProfiles';

type AdminPersona = 'pro' | 'quickstart' | 'b2b';

const PERSONA_KEYS: Record<
  AdminPersona,
  GenerationStarterPersona & AiBuilderStarterPersona
> = {
  pro: 'pro',
  quickstart: 'enterprise-quickstart',
  b2b: 'b2b-power-user',
};

const STORY_LABELS: Record<DemoUsageStory, string> = {
  healthy: 'Healthy',
  'at-risk': 'At Risk',
  burst: 'Late-month Spike',
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const persona = body.persona as AdminPersona;
  const story = body.story as DemoUsageStory;
  const demoMode = normalizeDemoMode(body.demoMode as DemoMode);
  const credentials = withFallbackHeaders(request.headers);

  return ndjsonStreamResponse(async (onLog) => {
    if (!credentials.metronomeApiKey?.trim()) {
      throw new Error('Metronome API key is required.');
    }
    if (!email) throw new Error('Customer email is required.');
    if (!Object.hasOwn(PERSONA_KEYS, persona)) {
      throw new Error('Invalid persona.');
    }
    if (!['healthy', 'at-risk', 'burst'].includes(story)) {
      throw new Error('Invalid usage story.');
    }

    const baseName = deriveCustomerNameFromEmail(email);
    const customerName = formatDemoCustomerName({
      demoMode,
      persona,
      baseName,
      suffix: STORY_LABELS[story],
    });
    const common = {
      apiKey: credentials.metronomeApiKey.trim(),
      persona: PERSONA_KEYS[persona],
      story,
      customerName,
      customerEmail: email,
      stripeSecretKey: credentials.stripeSecretKey?.trim() || undefined,
      deliveryMethodId:
        credentials.metronomeDeliveryMethodId?.trim() || undefined,
      onLog,
    };

    const result =
      demoMode === 'ai-builder'
        ? await prepareAiBuilderPersona(common)
        : await prepareGenerationPersona(common);

    return {
      ...result,
      demoMode,
      persona,
      story,
      customerName,
    };
  });
}
