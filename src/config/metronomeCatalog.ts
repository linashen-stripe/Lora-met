import manifest from '../../config/metronome/starter-kit.json';

export type CatalogMetricKey = 'image' | 'video' | '3d';
export type CatalogPackageKey = 'free' | 'pro' | 'quickstart';

const METRIC_SUFFIX: Record<CatalogMetricKey, string> = {
  image: 'Image Generations',
  video: 'Video Seconds',
  '3d': '3D Generations',
};

export function resolveMetronomeCatalog(
  resourcePrefix = manifest.resourcePrefix,
) {
  const prefix = resourcePrefix.trim() || manifest.resourcePrefix;
  return {
    ...manifest,
    resourcePrefix: prefix,
    rateCard: {
      ...manifest.rateCard,
      name: `${prefix} - Standard Rate Card`,
    },
    metrics: manifest.metrics.map((metric) => ({
      ...metric,
      key: metric.key as CatalogMetricKey,
      name: `${prefix} - ${METRIC_SUFFIX[metric.key as CatalogMetricKey]}`,
    })),
    products: {
      creditGrant: `${prefix} - Credit Grant`,
      proSubscription: `${prefix} - Pro Subscription`,
      enterpriseSeat: `${prefix} - Enterprise Seat`,
    },
    packages: manifest.packages.map((pkg) => ({
      ...pkg,
      key: pkg.key as CatalogPackageKey,
      name:
        pkg.key === 'free'
          ? `${prefix} Free`
          : pkg.key === 'pro'
            ? `${prefix} Pro`
            : `${prefix} Enterprise Quickstart`,
    })),
    powerUser: {
      ...manifest.powerUser,
      contractName: `${prefix} B2B Power User`,
    },
  };
}

export const METRONOME_CATALOG = resolveMetronomeCatalog();

export const METRONOME_PACKAGE_NAMES = {
  free: [METRONOME_CATALOG.packages.find((pkg) => pkg.key === 'free')!.name],
  premium: [
    METRONOME_CATALOG.packages.find((pkg) => pkg.key === 'pro')!.name,
  ],
  enterprise: [
    METRONOME_CATALOG.packages.find((pkg) => pkg.key === 'quickstart')!.name,
  ],
} as const;

export const METRONOME_CREDIT_USD =
  METRONOME_CATALOG.pricingUnit.fiatMinorUnitsPerCustomCredit / 100;

export function packageByKey(key: CatalogPackageKey) {
  return METRONOME_CATALOG.packages.find((pkg) => pkg.key === key);
}
