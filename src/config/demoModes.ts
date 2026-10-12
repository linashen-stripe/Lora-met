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
      free: ['Generate Free', 'Lora Generate Free'],
      premium: [
        'Generate Pro',
        'Lora Generate Pro',
        'Generate Premium',
        'Lora Generate Premium',
      ],
      enterprise: ['Generate Enterprise', 'Lora Generate Enterprise'],
    },
  },
  'ai-builder': {
    id: 'ai-builder',
    label: 'AI Builder',
    route: '/demos/ai-builder',
    customerPrefix: 'builder',
    packageNames: {
      free: ['AI Builder Free'],
      premium: ['AI Builder Premium'],
      enterprise: ['AI Builder Enterprise'],
    },
  },
};

export function normalizeDemoMode(value: unknown): DemoMode {
  return value === 'ai-builder' ? 'ai-builder' : 'generation';
}

export function customerStorageKey(mode: DemoMode): string {
  return `customer:${mode}`;
}
