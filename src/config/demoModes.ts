import { METRONOME_PACKAGE_NAMES } from '@/config/metronomeCatalog';
import { AI_BUILDER_PACKAGE_NAMES } from '@/config/aiBuilderCatalog';

export type DemoMode = 'generation' | 'ai-builder';

export interface DemoModeDefinition {
  id: DemoMode;
  label: string;
  route: string;
  customerPrefix: string;
  packageNames: {
    free: readonly string[];
    premium: readonly string[];
    enterprise: readonly string[];
  };
}

export const DEMO_MODES: Record<DemoMode, DemoModeDefinition> = {
  generation: {
    id: 'generation',
    label: 'Lora Generate',
    route: '/demos/generation',
    customerPrefix: 'generate',
    packageNames: {
      free: [...METRONOME_PACKAGE_NAMES.free, 'Generate Free'],
      premium: [
        ...METRONOME_PACKAGE_NAMES.premium,
        'Generate Pro',
        'Generate Premium',
        'Lora Generate Premium',
      ],
      enterprise: [
        ...METRONOME_PACKAGE_NAMES.enterprise,
        'Generate Enterprise',
        'Lora Generate Enterprise',
        'Generate Enterprise Quickstart',
        'Generate B2B Power User',
      ],
    },
  },
  'ai-builder': {
    id: 'ai-builder',
    label: 'AI Builder',
    route: '/demos/ai-builder',
    customerPrefix: 'builder',
    packageNames: {
      free: [
        AI_BUILDER_PACKAGE_NAMES.free,
        AI_BUILDER_PACKAGE_NAMES.legacyFree,
      ],
      premium: [
        AI_BUILDER_PACKAGE_NAMES.pro,
        AI_BUILDER_PACKAGE_NAMES.legacyPro,
        'AI Builder Premium',
      ],
      enterprise: [
        AI_BUILDER_PACKAGE_NAMES.quickstart,
        AI_BUILDER_PACKAGE_NAMES.legacyQuickstart,
        'AI Builder Enterprise',
      ],
    },
  },
};

export function normalizeDemoMode(value: unknown): DemoMode {
  return value === 'ai-builder' ? 'ai-builder' : 'generation';
}

export function customerStorageKey(mode: DemoMode): string {
  return `customer:${mode}`;
}
