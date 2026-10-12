'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useConfigContext } from '@/contexts/ConfigContext';
import EmbeddedCheckout from '@/components/checkout/EmbeddedCheckout';
import useMetronomePackageCheckout from '@/components/subscribe/useMetronomePackageCheckout';
import MetronomePackageCheckoutSidebar from '@/components/subscribe/MetronomePackageCheckoutSidebar';
import { LoadingOverlay } from '@/components';
import ErrorBanner from '@/components/ui/ErrorBanner';
import fetchClient from '@/utils/fetchClient';
import { pickMetronomePackageForTier } from '@/utils/metronomePackageResolve';

function SubscribeMetronomePackageCheckoutBody({
  packageId,
  isUpgrade,
}: {
  packageId: string;
  isUpgrade: boolean;
}) {
  const { settings } = useConfigContext();
  const {
    isLoading,
    isProcessing,
    error,
    checkoutData,
    handleComplete,
    selectedPackage,
    packagesLoaded,
  } = useMetronomePackageCheckout({ packageId, isUpgrade });

  if (error) {
    return <ErrorBanner message={error} />;
  }

  if (isLoading || !checkoutData || isProcessing || !settings) {
    return <LoadingOverlay />;
  }

  return (
    <EmbeddedCheckout
      compact
      checkoutData={checkoutData}
      onComplete={handleComplete}
      sidebar={
        <MetronomePackageCheckoutSidebar
          pkg={selectedPackage}
          language={settings.language}
          currency={settings.currency}
          isLoading={!packagesLoaded}
        />
      }
      settings={{
        language: settings.language,
        checkoutMethod: settings.checkoutMethod,
        country: settings.country || 'US',
        currency: settings.currency || 'usd',
        email: settings.email || 'demo@example.com',
        stripePublishableKey: settings.stripePublishableKey || '',
        specialSku: settings.specialSku,
        specialSkuPmc: settings.specialSkuPmc,
      }}
    />
  );
}

/**
 * Shared Metronome package checkout: embedded Setup + package sidebar.
 * - `packageId` query: explicit Metronome package (wins over tier).
 * - Otherwise `tier=premium` (default) or `tier=enterprise`: package whose name is exactly `premium` / `enterprise` (or `enterpise` Hub typo); premium falls back to a word-boundary match.
 * - `upgrade=true`: archives existing contracts on the server before creating the new one.
 */
export default function SubscribeMetronomePackageCheckoutView() {
  const searchParams = useSearchParams();
  const packageIdParam = searchParams.get('packageId');
  const tierParam = searchParams.get('tier')?.toLowerCase() ?? 'premium';
  const subscribeTier = tierParam === 'enterprise' ? 'enterprise' : 'premium';
  const isUpgrade = searchParams.get('upgrade') === 'true';

  const [resolvedPackageId, setResolvedPackageId] = useState<string | null>(() =>
    packageIdParam?.trim() ? packageIdParam.trim() : null,
  );
  const [resolution, setResolution] = useState<'pending' | 'done'>(() =>
    packageIdParam?.trim() ? 'done' : 'pending',
  );
  const [resolveError, setResolveError] = useState<string | null>(null);

  useEffect(() => {
    const explicit = packageIdParam?.trim();
    if (explicit) {
      setResolvedPackageId(explicit);
      setResolution('done');
      setResolveError(null);
      return;
    }

    let cancelled = false;
    setResolution('pending');
    setResolveError(null);

    fetchClient
      .get<{ packages?: { id: string; name?: string }[] }>('/api/metronome/packages')
      .then(({ data }) => {
        if (cancelled) return;
        const list = data.packages ?? [];
        const found = pickMetronomePackageForTier(list, subscribeTier);
        setResolvedPackageId(found?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setResolveError('Could not load Metronome packages.');
          setResolvedPackageId(null);
        }
      })
      .finally(() => {
        if (!cancelled) setResolution('done');
      });

    return () => {
      cancelled = true;
    };
  }, [packageIdParam, subscribeTier]);

  if (resolveError) {
    return <ErrorBanner message={resolveError} />;
  }

  if (resolution === 'pending' || !resolvedPackageId) {
    if (resolution === 'done' && !resolvedPackageId) {
      return (
        <ErrorBanner
          message={
            subscribeTier === 'enterprise'
              ? 'No Enterprise package found: Metronome needs a package whose name is exactly "enterprise" (or "enterpise"). Pass packageId=… to override.'
              : 'No Premium package found in Metronome. Check your catalog, pass packageId, or use tier=premium.'
          }
        />
      );
    }
    return <LoadingOverlay />;
  }

  return (
    <SubscribeMetronomePackageCheckoutBody
      packageId={resolvedPackageId}
      isUpgrade={isUpgrade}
    />
  );
}
