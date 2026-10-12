/**
 * Pick a Metronome package id from a list for subscribe / upgrade flows.
 * Enterprise is matched **strictly** on the package display name so substring
 * matches (e.g. "Custom enterprise pricing") do not win over the real Enterprise SKU.
 */

export type MetronomeSubscribeTier = 'premium' | 'enterprise';

function normName(name: string | undefined | null): string {
  return (name ?? '').trim().toLowerCase();
}

/** Exact names (Hub spelling) that count as the Enterprise package for contracts. */
const ENTERPRISE_PACKAGE_NAMES = new Set(['enterprise', 'enterpise']);

export function pickMetronomePackageForTier(
  packages: { id: string; name?: string }[],
  tier: MetronomeSubscribeTier,
): { id: string; name?: string } | undefined {
  if (tier === 'enterprise') {
    return packages.find((p) => ENTERPRISE_PACKAGE_NAMES.has(normName(p.name)));
  }

  const exactPremium = packages.find((p) => normName(p.name) === 'premium');
  if (exactPremium) return exactPremium;

  return packages.find((p) => /\bpremium\b/i.test(p.name ?? ''));
}
