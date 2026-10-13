import {
  DEMO_MODES,
  normalizeDemoMode,
  type DemoMode,
} from '@/config/demoModes';

/**
 * Pick a Metronome package id from a list for subscribe / upgrade flows.
 * Enterprise is matched **strictly** on the package display name so substring
 * matches (e.g. "Custom enterprise pricing") do not win over the real Enterprise SKU.
 */

export type MetronomeSubscribeTier = 'premium' | 'enterprise';

function normName(name: string | undefined | null): string {
  return (name ?? '').trim().toLowerCase();
}

/** Legacy Hub spellings retained for AI Builder compatibility. */
const ENTERPRISE_PACKAGE_NAMES = new Set(['enterprise', 'enterpise']);

export function pickMetronomePackageForTier(
  packages: { id: string; name?: string }[],
  tier: MetronomeSubscribeTier,
  demoMode: DemoMode = 'generation',
): { id: string; name?: string } | undefined {
  const mode = normalizeDemoMode(demoMode);
  const configuredNames = new Set(
    DEMO_MODES[mode].packageNames[tier].map(normName),
  );
  const namespaced = packages.find((pkg) =>
    configuredNames.has(normName(pkg.name)),
  );
  if (namespaced) return namespaced;

  if (tier === 'enterprise') {
    return packages.find((p) => ENTERPRISE_PACKAGE_NAMES.has(normName(p.name)));
  }

  const legacyPaidTier = mode === 'generation' ? 'pro' : 'premium';
  const exactPaidTier = packages.find(
    (p) => normName(p.name) === legacyPaidTier,
  );
  if (exactPaidTier) return exactPaidTier;

  return packages.find((p) =>
    mode === 'generation'
      ? /\bpro\b/i.test(p.name ?? '')
      : /\bpremium\b/i.test(p.name ?? ''),
  );
}
