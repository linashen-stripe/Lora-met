import { useConfigContext } from '@/contexts/ConfigContext';
import { getEffectiveMetronomeCustomerId } from '@/config/metronomeDefaults';
import fetchClient from '@/utils/fetchClient';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import Stripe from 'stripe';
import type { MetronomePackageSummary } from '@/components/subscribe/MetronomePackageCheckoutSidebar';

const CONTRACT_READY_POLL_INTERVAL_MS = 750;
const CONTRACT_READY_MAX_ATTEMPTS = 20;

async function waitForContractCredits(
  metronomeCustomerId: string,
  contractId: string,
): Promise<void> {
  for (let attempt = 0; attempt < CONTRACT_READY_MAX_ATTEMPTS; attempt++) {
    try {
      const { data } = await fetchClient.get(
        `/api/metronome/customer/${encodeURIComponent(metronomeCustomerId)}/contracts`,
      );
      const contract = (data?.contracts ?? []).find(
        (candidate: any) => candidate?.id === contractId,
      );
      const balanceItems = [
        ...(contract?.commits ?? []),
        ...(contract?.credits ?? []),
      ];
      if (contract && balanceItems.length > 0) return;
    } catch {
      // Metronome can briefly return stale data while a contract propagates.
    }

    await new Promise((resolve) =>
      setTimeout(resolve, CONTRACT_READY_POLL_INTERVAL_MS),
    );
  }

  throw new Error('Your plan was created, but its credits are still being prepared.');
}

const useMetronomePackageCheckout = ({
  packageId,
  isUpgrade = false,
}: {
  packageId: string | null;
  /** When true, server archives existing Metronome contracts before creating the new one. */
  isUpgrade?: boolean;
}) => {
  const router = useRouter();
  const {
    settings,
    customer,
    metronomeContract,
    updateCustomer,
    triggerMetronomeContractRefresh,
  } = useConfigContext();
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkoutData, setCheckoutData] = useState<{
    clientSecret: string;
    sessionId: string;
  } | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<MetronomePackageSummary | null>(null);
  const [packagesLoaded, setPackagesLoaded] = useState(false);

  useEffect(() => {
    if (!packageId) return;

    if (!settings) {
      setError('Could not create checkout session, you may not be signed in.');
      return;
    }

    setCheckoutData(null);
    setError(null);

    const createSession = async () => {
      // If no Stripe customer yet, re-run sign-in to create and link one.
      if (!customer?.stripeCustomerId && customer?.email) {
        try {
          const { data: signInData } = await fetchClient.post('/api/auth/sign-in', {
            email: customer.email,
          });
          if (signInData.stripeCustomerId) {
            updateCustomer({ stripeCustomerId: signInData.stripeCustomerId });
          }
        } catch {
          // non-fatal — setup-checkout-session will surface the error
        }
      }

      const { data } = await fetchClient.post('/api/stripe/setup-checkout-session', {
        settings: {
          language: settings.language,
          currency: settings.currency,
        },
      });
      setCheckoutData(data);
    };

    createSession().catch(() => {
      setError('Could not create checkout session, please try again.');
    });
  }, [settings, packageId]);

  useEffect(() => {
    if (!packageId || !settings) {
      setSelectedPackage(null);
      setPackagesLoaded(false);
      return;
    }

    setPackagesLoaded(false);
    fetchClient
      .get('/api/metronome/packages')
      .then(({ data }) => {
        const list = (data.packages ?? []) as MetronomePackageSummary[];
        const found = list.find((p) => p.id === packageId) ?? null;
        setSelectedPackage(found);
      })
      .catch(() => {
        setSelectedPackage(null);
      })
      .finally(() => {
        setPackagesLoaded(true);
      });
  }, [packageId, settings]);

  const handleComplete = useCallback(async () => {
    if (!checkoutData?.sessionId || !customer?.id || !packageId) {
      setError('Could not complete checkout, please try again.');
      return;
    }

    setIsProcessing(true);
    let keepProcessingUntilNavigation = false;

    try {
      const { data: sessionData } =
        await fetchClient.get<Stripe.Checkout.Session>(
          `/api/stripe/checkout-session/${checkoutData.sessionId}`,
        );

      if (sessionData.status !== 'complete') {
        setError('Checkout session not completed, please try again.');
        return;
      }

      // Save payment method to customer
      const intent = sessionData.setup_intent || sessionData.payment_intent;
      if (intent) {
        const stripeCustomerId = customer.stripeCustomerId;
        if (!stripeCustomerId) {
          setError(
            'Missing Stripe customer — sign in again or check account setup.',
          );
          return;
        }
        await fetchClient.post('/api/stripe/payment-method', {
          customerId: stripeCustomerId,
          intent,
        });
      }

      // Create Metronome contract for the selected package
      const metronomeCustomerId = getEffectiveMetronomeCustomerId(customer);
      if (!metronomeCustomerId) {
        setError('Missing Metronome customer — sign in again or check account setup.');
        return;
      }
      const { data: contractData } = await fetchClient.post<{ contractId: string }>(
        `/api/metronome/customer/${encodeURIComponent(metronomeCustomerId)}/contracts`,
        { packageId, email: customer.email, upgrade: isUpgrade },
      );

      await waitForContractCredits(metronomeCustomerId, contractData.contractId);
      await triggerMetronomeContractRefresh();

      const lang = settings?.language ?? 'en';
      const creditsFrom = metronomeContract?.creditBalance.totalAvailable;
      keepProcessingUntilNavigation = true;
      router.push(
        `/${lang}/dashboard${
          typeof creditsFrom === 'number' ? `?creditsFrom=${creditsFrom}` : ''
        }`,
      );
    } catch (err: any) {
      setError(
        err?.response?.data?.error ||
          err?.message ||
          'Could not complete checkout.',
      );
    } finally {
      if (!keepProcessingUntilNavigation) {
        setIsProcessing(false);
      }
    }
  }, [
    checkoutData,
    customer,
    packageId,
    settings,
    router,
    isUpgrade,
    metronomeContract?.creditBalance.totalAvailable,
    triggerMetronomeContractRefresh,
  ]);

  const isLoading = !checkoutData && !error;

  return {
    isLoading,
    isProcessing,
    error,
    checkoutData,
    handleComplete,
    selectedPackage,
    packagesLoaded,
  };
};

export default useMetronomePackageCheckout;
