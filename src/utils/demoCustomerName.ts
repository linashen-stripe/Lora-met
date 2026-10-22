import type { DemoMode } from '@/config/demoModes';

export type DemoCustomerPersona = 'free' | 'pro' | 'quickstart' | 'b2b';

const MODE_LABELS: Record<DemoMode, string> = {
  generation: 'Generate',
  'ai-builder': 'AI Builder',
};

const LEGACY_MODE_PREFIXES: Record<DemoMode, readonly string[]> = {
  generation: ['[Lora Generate]'],
  'ai-builder': ['[AI Builder]'],
};

const PERSONA_LABELS: Record<DemoCustomerPersona, string> = {
  free: 'Free',
  pro: 'Pro',
  quickstart: 'Quickstart',
  b2b: 'B2B',
};

export function formatDemoCustomerName({
  demoMode,
  persona,
  baseName,
  suffix,
}: {
  demoMode: DemoMode;
  persona: DemoCustomerPersona;
  baseName: string;
  suffix?: string;
}): string {
  const name = `[${MODE_LABELS[demoMode]} - ${PERSONA_LABELS[persona]}] ${baseName.trim()}`;
  return suffix?.trim() ? `${name} · ${suffix.trim()}` : name;
}

export function hasDemoCustomerNamePrefix(
  name: string | null | undefined,
  demoMode: DemoMode,
): boolean {
  if (!name) return false;
  return (
    name.startsWith(`[${MODE_LABELS[demoMode]} - `) ||
    LEGACY_MODE_PREFIXES[demoMode].some((prefix) => name.startsWith(prefix))
  );
}
