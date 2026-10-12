'use client';

import { useEffect, useState, type ReactNode, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import fetchClient from '@/utils/fetchClient';
import { useConfigContext } from '@/contexts/ConfigContext';
import { useTranslation } from 'react-i18next';
import { LoadingOverlay } from '@/components';
import { formatPrice } from '@/utils/helpers';
import PricingCard, { type Plan } from '@/components/pricing/PricingCard';
import PayAsYouGoPricingTable from '@/components/pricing/PayAsYouGoPricingTable';
import FaqSection from '@/components/pricing/FaqSection';
import SubscribePricingPlanEmbeddedDialog from '@/components/subscribe/SubscribePricingPlanEmbeddedDialog';
import SubscribeMetronomePackageDialog from '@/components/subscribe/SubscribeMetronomePackageDialog';
import { PricingPlan } from '@/utils/types';
import { getEffectiveMetronomeCustomerId } from '@/config/metronomeDefaults';
import {
  GENERATION_PLANS,
  GENERATION_SKUS,
} from '@/config/generationCatalog';
import { DEMO_MODES } from '@/config/demoModes';

/** Metronome package `name` must match one of these (case-insensitive, trimmed) to appear on /pricing. */
const METRONOME_PRICING_PACKAGE_NAMES = new Set(['free', 'premium', 'enterprise']);

function normPackageName(name: string | null | undefined): string {
  return String(name ?? '').trim().toLowerCase();
}

function isAllowedMetronomePricingPackage(pkg: { name?: string }): boolean {
  return METRONOME_PRICING_PACKAGE_NAMES.has(normPackageName(pkg.name));
}

function PricingPageContent() {
  const {
    customer,
    settings,
    plan: currentPlan,
    metronomeContract,
    demoMode,
  } = useConfigContext();
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [premiumPlan, setPremiumPlan] = useState<PricingPlan | null>(null);
  const [premiumPlanPrice, setPremiumPlanPrice] = useState<number | null>(null);
  const [freePlan, setFreePlan] = useState<PricingPlan | null>(null);
  const [metronomePackages, setMetronomePackages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSelectingPackage, setIsSelectingPackage] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(
    null,
  );
  const [packageError, setPackageError] = useState<string | null>(null);
  const [showUpgradePaymentModal, setShowUpgradePaymentModal] = useState(false);

  const isLoggedIn = Boolean(customer?.id);
  const hasMetronomeCustomer = Boolean(
    getEffectiveMetronomeCustomerId(customer),
  );
  const hasFreePlan =
    currentPlan?.lookupKey?.includes('free') ||
    normPackageName(metronomeContract?.name).includes('free');
  const hasPremiumPlan =
    currentPlan?.lookupKey?.includes('premium') ||
    ['premium', 'pro'].some((tier) =>
      normPackageName(metronomeContract?.name).includes(tier),
    );
  const hasMetronomeContract = Boolean(metronomeContract);
  const checkoutModalEnabled = settings?.checkoutMethod === 'embedded-checkout';
  const currency = settings?.currency || 'usd';

  // For logged-in Metronome customers: create a contract directly without going through sign-up
  const handleSelectPackage = async (packageId: string) => {
    const metronomeCustomerId = getEffectiveMetronomeCustomerId(customer);
    if (!metronomeCustomerId || isSelectingPackage) return;
    setIsSelectingPackage(true);
    setPackageError(null);
    try {
      await fetchClient.post(
        `/api/metronome/customer/${metronomeCustomerId}/contracts`,
        { packageId, email: customer?.email },
      );
      router.push(`/${settings?.language || 'en'}/demos/${demoMode}`);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        'Failed to create contract';
      console.error('Failed to create contract:', msg);
      setPackageError(msg);
      setIsSelectingPackage(false);
    }
  };

  const faqs: { question: string; answer: ReactNode }[] = [
    {
      question: t('faq.questions.credits.question'),
      answer: (
        <p>
          {t('faq.questions.credits.answer', {
            premiumCredits: formatPrice(2000, settings?.language, currency),
            freeCredits: formatPrice(500, settings?.language, currency),
          })}
        </p>
      ),
    },
    {
      question: t('faq.questions.over_credits.question'),
      answer: (
        <div className='space-y-4'>
          <p>{t('faq.questions.over_credits.intro')}</p>
          <div className='pl-2'>
            <h4 className='font-semibold text-foreground'>
              {t('faq.questions.over_credits.auto_topup.title')}
            </h4>
            <p className='mt-1'>
              {t('faq.questions.over_credits.auto_topup.description')}
            </p>
          </div>
          <div className='pl-2'>
            <h4 className='font-semibold text-foreground'>
              {t('faq.questions.over_credits.credit_packs.title')}
            </h4>
            <p className='mt-1'>
              {t('faq.questions.over_credits.credit_packs.description')}
            </p>
            <ul className='list-disc pl-6 mt-2 space-y-1'>
              <li>
                {t('faq.questions.over_credits.credit_packs.pack1', {
                  amount: formatPrice(1000, settings?.language, currency),
                })}
              </li>
              <li>
                {t('faq.questions.over_credits.credit_packs.pack2', {
                  amount: formatPrice(2500, settings?.language, currency),
                })}
              </li>
              <li>
                {t('faq.questions.over_credits.credit_packs.pack3', {
                  amount: formatPrice(500, settings?.language, currency),
                })}
              </li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      question: t('faq.questions.rollover.question'),
      answer: <p>{t('faq.questions.rollover.answer')}</p>,
    },
    {
      question: t('faq.questions.change_plan.question'),
      answer: <p>{t('faq.questions.change_plan.answer')}</p>,
    },
  ];

  useEffect(() => {
    const premiumPlanLookupKey = `llama_ai_premium_plan_${currency}`;
    const freePlanLookupKey = `llama_ai_free_plan_${currency}`;

    Promise.all([
      demoMode === 'ai-builder'
        ? fetchClient
            .get(`/api/stripe/pricing-plan?lookup_keys=${premiumPlanLookupKey}`)
            .catch(() => ({ data: { plans: [] } }))
        : Promise.resolve({ data: { plans: [] } }),
      demoMode === 'ai-builder'
        ? fetchClient
            .get(`/api/stripe/pricing-plan?lookup_keys=${freePlanLookupKey}`)
            .catch(() => ({ data: { plans: [] } }))
        : Promise.resolve({ data: { plans: [] } }),
      fetchClient
        .get('/api/metronome/packages')
        .catch(() => ({ data: { packages: [] } })),
    ])
      .then(async ([premiumResponse, freeResponse, packagesResponse]) => {
        const proPlan = premiumResponse.data.plans[0];
        const freePlanData = freeResponse.data.plans[0];
        const rawPackages = packagesResponse.data.packages ?? [];
        const modePackageNames = new Set(
          Object.values(DEMO_MODES[demoMode].packageNames)
            .flat()
            .map(normPackageName),
        );
        const namespacedPackages = rawPackages.filter((pkg: any) =>
          modePackageNames.has(normPackageName(pkg.name)),
        );
        const packages =
          namespacedPackages.length > 0
            ? namespacedPackages
            : demoMode === 'ai-builder'
              ? rawPackages.filter(isAllowedMetronomePricingPackage)
              : [];

        if (freePlanData) setFreePlan(freePlanData);
        setMetronomePackages(packages);

        if (proPlan) {
          setPremiumPlan(proPlan);
          try {
            const { data } = await fetchClient.get(
              `/api/stripe/pricing-plan/${proPlan.id}`,
            );
            if (data.expandedComponents) {
              const licenseFees = data.expandedComponents
                .filter((c: any) => c.type === 'license_fee')
                .reduce(
                  (acc: number, fee: any) =>
                    acc + Number(fee.expanded_license_fee.unit_amount),
                  0,
                );
              setPremiumPlanPrice(licenseFees);
            }
          } catch {
            // premium plan price not critical
          }
        }

        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Unable to fetch pricing plans:', err);
        setIsLoading(false);
      });
  }, [currency, demoMode]);

  // Auto-open upgrade modal if upgrade=true in URL
  useEffect(() => {
    const shouldUpgrade = searchParams.get('upgrade') === 'true';
    if (shouldUpgrade && hasFreePlan && !isLoading) {
      const paidPackageNames = new Set(
        DEMO_MODES[demoMode].packageNames.premium.map(normPackageName),
      );
      const premiumPackage = metronomePackages.find((pkg) =>
        paidPackageNames.has(normPackageName(pkg.name)),
      );
      if (premiumPackage?.id) {
        setSelectedPackageId(premiumPackage.id);
      } else if (demoMode === 'ai-builder' && checkoutModalEnabled) {
        setShowUpgradePaymentModal(true);
      } else {
        setPackageError(
          `Could not find the ${DEMO_MODES[demoMode].label} paid package.`,
        );
      }
    }
  }, [
    searchParams,
    hasFreePlan,
    checkoutModalEnabled,
    demoMode,
    isLoading,
    metronomePackages,
  ]);

  if (isLoading) {
    return <LoadingOverlay />;
  }

  const getUpgradeButtonProps = () => {
    if (hasFreePlan && checkoutModalEnabled) {
      return {
        onClick: () => {
          setShowUpgradePaymentModal(true);
        },
      };
    }

    if (hasFreePlan && !checkoutModalEnabled) {
      return {
        link: `/${settings?.language}/subscribe/metronome-package?upgrade=true&demoMode=${demoMode}`,
      };
    }

    if (!isLoggedIn) {
      return {
        link: `/${settings?.language}/auth/sign-up?plan=pricing-plan-pro&demoMode=${demoMode}`,
      };
    }

    return {
      link: `/${settings?.language}/subscribe/metronome-package?demoMode=${demoMode}`,
    };
  };

  const freePackage = metronomePackages.find((p: any) =>
    normPackageName(p.name).includes('free'),
  );

  const freeCard: Plan = {
    name: t(
      'products.default_free.name',
      freePlan?.display_name || 'Free Plan',
    ),
    price: formatPrice(0, settings?.language, settings?.currency),
    priceDetails: t('plans.price_details.month', '/month'),
    description: t(
      'plans.free.description',
      'Perfect for individuals getting started with AI content creation.',
    ),
    credit: {
      amount: formatPrice(500, settings?.language, settings?.currency),
      description: t(
        'plans.free.credit_description',
        'in lifetime credits (one-time)',
      ),
      amountClass: 'text-foreground',
      descriptionClass: 'text-muted-foreground',
    },
    features: [
      t('plans.free.features.1', 'Free for individual usage'),
      t('plans.free.features.2', 'Unlimited image and video generation'),
      t('plans.free.features.3', 'Standard embedding creation'),
      t('plans.free.features.4', 'Community support'),
      t('plans.free.features.5', 'Basic analytics dashboard'),
    ],
    button: {
      text: hasFreePlan
        ? t('plans.free.button.current', 'Current Plan')
        : t('plans.free.button.get_started', 'Get Started for Free'),
      link: freePackage
        ? `/${settings?.language}/auth/sign-up?packageId=${freePackage.id}&demoMode=${demoMode}`
        : `/${settings?.language}/auth/sign-up?plan=free&demoMode=${demoMode}`,
      className:
        'w-full mt-8 text-base py-3 bg-accent text-accent-foreground hover:bg-purple-hover transition-colors duration-200',
      icon: undefined,
      disabled:
        hasFreePlan ||
        hasPremiumPlan ||
        hasMetronomeContract ||
        hasMetronomeCustomer,
    },
    isPopular: false,
  };

  const teamCard: Plan = {
    name: t('products.default_team.name', 'Enterprise'),
    price: t('plans.team.custom_pricing', 'Custom Pricing'),
    priceDetails: null,
    description: t(
      'products.default_team.description',
      'Tailored solutions for enterprise and high-volume users.',
    ),
    credit: {
      amount: t('plans.team.custom_amount', 'Custom'),
      description: t(
        'plans.team.credit_description',
        'Credit allocation based on business needs',
      ),
      amountClass: 'text-foreground',
      descriptionClass: 'text-muted-foreground',
    },
    features: [
      t('plans.team.features.1', 'All Premium Plan features'),
      t('plans.team.features.2', 'Tailored solutions for high-volume users'),
      t('plans.team.features.3', 'Dedicated account manager'),
      t('plans.team.features.4', 'Centralized billing management'),
      t('plans.team.features.5', 'Enhanced security features'),
      t('plans.team.features.6', 'Exclusive access to beta features'),
    ],
    button: {
      text: t('plans.team.button.contact_sales', 'Contact Sales'),
      link: `/${settings?.language}/contact-us`,
      className:
        'w-full mt-8 text-base py-3 bg-accent text-accent-foreground hover:bg-purple-hover transition-colors duration-200',
    },
    isPopular: false,
  };

  // Sort packages: free first, enterprise last, premium in the middle
  const sortedPackages = [...metronomePackages].sort((a, b) => {
    if (normPackageName(a.name).includes('free')) return -1;
    if (normPackageName(b.name).includes('free')) return 1;
    if (normPackageName(a.name).includes('enterprise')) return 1;
    if (normPackageName(b.name).includes('enterprise')) return -1;
    return 0;
  });

  // Build package cards from Metronome packages
  const packageCards: Plan[] = sortedPackages.map((pkg, idx) => {
    const packageName = normPackageName(pkg.name);
    const catalogPlan = GENERATION_PLANS.find((plan) =>
      packageName.endsWith(plan.name.toLowerCase()),
    );
    const aiBuilderIncludedCents =
      demoMode === 'ai-builder'
        ? normPackageName(pkg.name).includes('free')
          ? 500
          : normPackageName(pkg.name).includes('premium')
            ? 2_000
            : null
        : null;
    const isCurrentPlan =
      Boolean(metronomeContract) && metronomeContract!.name === pkg.name;

    const isFreePlan = pkg.price_cents === 0;
    const isPricedPlan = pkg.price_cents != null && pkg.price_cents !== 0;
    const features: string[] =
      demoMode === 'generation'
        ? isFreePlan
          ? [
              'Image, video, and 3D generation',
              '100 one-time generation credits',
              'Transparent per-job credit costs',
            ]
          : isPricedPlan
            ? [
                'All Free plan features',
                'Monthly generation credit allowance',
                'Usage and billing analytics',
                'Priority support',
              ]
            : [
                'Custom prepaid commitment',
                'Per-seat monthly credit allocations',
                'Negotiated generation rates',
                'Auto top-up and spend alerts',
              ]
        : isFreePlan
          ? [
          t('plans.free.features.1', 'Free for individual usage'),
          t('plans.free.features.2', 'Unlimited image and video generation'),
          t('plans.free.features.3', 'Standard embedding creation'),
          t('plans.free.features.4', 'Community support'),
          t('plans.free.features.5', 'Basic analytics dashboard'),
          ]
        : isPricedPlan
          ? [
            t('plans.premium.features.1', 'All Free Plan features'),
            t('plans.premium.features.2', 'Priority support via email'),
            t('plans.premium.features.3', 'Comprehensive analytics dashboard'),
            t(
              'plans.premium.features.4',
              'API access for programmatic integration',
            ),
            t(
              'plans.premium.features.5',
              'Single Sign-On (SSO) for enhanced security',
            ),
            t(
              'plans.premium.features.6',
              'Automated zero data retention feature',
            ),
            ]
          : [
            t('plans.team.features.1', 'All Premium Plan features'),
            t(
              'plans.team.features.2',
              'Tailored solutions for high-volume users',
            ),
            t('plans.team.features.3', 'Dedicated account manager'),
            t('plans.team.features.4', 'Centralized billing management'),
            t('plans.team.features.5', 'Enhanced security features'),
            t('plans.team.features.6', 'Exclusive access to beta features'),
            ];

    const isCustomPricing = pkg.price_cents === null;
    const price = isCustomPricing
      ? t('plans.team.custom_pricing', 'Custom Pricing')
      : formatPrice(pkg.price_cents ?? 0, settings?.language, currency);
    const priceDetails = isCustomPricing
      ? null
      : t('plans.price_details.month', '/month');

    return {
      name: pkg.name || `Plan ${idx + 1}`,
      price,
      priceDetails,
      description: isFreePlan
        ? t(
            'plans.free.description',
            'Perfect for individuals getting started with AI content creation.',
          )
        : isPricedPlan
          ? t(
              'plans.premium.description',
              'Ideal for professionals and growing businesses.',
            )
          : t(
              'products.default_team.description',
              'Tailored solutions for enterprise and high-volume users.',
            ),
      credit: {
        amount:
          catalogPlan?.includedCredits != null
            ? `${catalogPlan.includedCredits.toLocaleString()} credits`
            : aiBuilderIncludedCents != null
              ? formatPrice(
                  aiBuilderIncludedCents,
                  settings?.language,
                  settings?.currency,
                )
            : t('plans.team.custom_amount', 'Custom'),
        description: isFreePlan
          ? t('plans.free.credit_description', 'one-time generation allowance')
          : isPricedPlan
            ? t('plans.premium.credit_description', 'included each month')
            : t(
                'plans.team.credit_description',
                'Credit allocation based on business needs',
              ),
        amountClass: 'text-foreground',
        descriptionClass: 'text-muted-foreground',
      },
      features,
      button: {
        text: isCurrentPlan
          ? t('plans.free.button.current', 'Current Plan')
          : isSelectingPackage
            ? t('common.loading')
            : t('common.get_started'),
        // Priced plans: show payment dialog for logged-in Metronome customers
        // Free/custom plans: create contract directly (no payment needed)
        ...(hasMetronomeCustomer && !isCurrentPlan
          ? isPricedPlan
            ? { onClick: () => setSelectedPackageId(pkg.id) }
            : { onClick: () => handleSelectPackage(pkg.id) }
          : {
              link: isCurrentPlan
                ? undefined
                : isPricedPlan
                  ? `/${settings?.language}/auth/sign-up?packageId=${pkg.id}&requiresPayment=true&demoMode=${demoMode}`
                  : `/${settings?.language}/auth/sign-up?packageId=${pkg.id}&demoMode=${demoMode}`,
            }),
        className:
          'w-full mt-8 text-base py-3 bg-accent text-accent-foreground hover:bg-purple-hover transition-colors duration-200',
        disabled: isCurrentPlan || isSelectingPackage,
      },
      isPopular: false,
    };
  });

  const staticPlanCatalog =
    demoMode === 'generation'
      ? GENERATION_PLANS.filter((plan) =>
          ['free', 'pro', 'premium', 'enterprise'].includes(plan.id),
        )
      : [
          {
            id: 'free' as const,
            name: 'AI Builder Free',
            monthlyPrice: 0,
            includedCredits: 500,
            description: 'Try conversational app building with $5 in usage credit.',
          },
          {
            id: 'premium' as const,
            name: 'AI Builder Premium',
            monthlyPrice: 20,
            includedCredits: 2_000,
            description: 'Token-priced app building with monthly included credit.',
          },
          {
            id: 'enterprise' as const,
            name: 'AI Builder Enterprise',
            monthlyPrice: null,
            includedCredits: null,
            description: 'Custom commitments and negotiated token rates for teams.',
          },
        ];

  const staticModeCards: Plan[] = staticPlanCatalog.map((plan) => ({
    name: plan.name,
    price:
      plan.monthlyPrice === null
        ? t('plans.team.custom_pricing', 'Custom Pricing')
        : formatPrice(
            plan.monthlyPrice * 100,
            settings?.language,
            settings?.currency,
          ),
    priceDetails:
      plan.monthlyPrice === null
        ? null
        : t('plans.price_details.month', '/month'),
    description: plan.description,
    credit: {
      amount:
        plan.includedCredits === null
          ? t('plans.team.custom_amount', 'Custom')
          : demoMode === 'generation'
            ? `${plan.includedCredits.toLocaleString()} credits`
            : formatPrice(
                plan.includedCredits,
                settings?.language,
                settings?.currency,
              ),
      description:
        plan.id === 'free'
          ? t(
              'plans.free.credit_description',
              demoMode === 'generation'
                ? 'one-time generation allowance'
                : 'one-time usage credit',
            )
          : t('plans.premium.credit_description', 'included each month'),
      amountClass: 'text-foreground',
      descriptionClass: 'text-muted-foreground',
    },
    features:
      plan.id === 'enterprise'
        ? [
            'Custom prepaid commitment',
            'Per-seat monthly credit allocations',
            'Negotiated generation rates',
            'Auto top-up and spend alerts',
          ]
        : demoMode === 'generation'
          ? [
              'Image, video, and 3D generation',
              'Transparent per-job credit costs',
              'Usage and billing analytics',
            ]
          : [
              'Conversational application building',
              'Input and output token pricing',
              'Usage and billing analytics',
            ],
    button: {
      text:
        plan.id === 'enterprise'
          ? t('plans.team.button.contact_sales', 'Contact Sales')
          : plan.id === 'free'
            ? t('plans.free.button.get_started', 'Start for free')
            : t('common.get_started', 'Get started'),
      link:
        plan.id === 'enterprise'
          ? `/${settings?.language}/contact-us`
          : `/${settings?.language}/auth/sign-up?plan=${plan.id}&demoMode=${demoMode}`,
      className:
        'w-full mt-8 text-base py-3 bg-accent text-accent-foreground hover:bg-purple-hover transition-colors duration-200',
    },
    isPopular: plan.id === 'premium',
  }));

  // Prefer live Metronome packages; show the selected mode catalog without credentials.
  const middleCards: Plan[] =
    sortedPackages.length > 0
      ? packageCards
      : staticModeCards;

  const plansData: Plan[] = [...middleCards];

  return (
    <div className='flex flex-col min-h-screen bg-background text-foreground'>
      <main className='flex-1'>
        {/* Page Title */}
        <section className='container mx-auto px-6 py-10 text-center'>
          <div className='flex flex-col items-center mb-8'>
            <h1 className='text-5xl font-semibold tracking-tight text-foreground mb-4'>
              {demoMode === 'generation'
                ? t('pricing.generation_page_title', 'Lora Generate pricing')
                : t('pricing.builder_page_title', 'AI Builder pricing')}
            </h1>
            <p className='text-md text-muted-foreground max-w-2xl mx-auto'>
              {demoMode === 'generation'
                ? t(
                    'pricing.generation_page_description',
                    'Start with 100 free credits, then scale image, video, and 3D generation as you grow.',
                  )
                : t(
                    'pricing.builder_page_description',
                    'Start with token usage credit, then scale conversational app building as you grow.',
                  )}
            </p>
          </div>
        </section>

        {/* Subscription Plans */}
        <section className='container mx-auto px-6 pb-20'>
          <div
            className='grid gap-8 max-w-6xl mx-auto items-stretch'
            style={{
              gridTemplateColumns: `repeat(${Math.min(plansData.length, 4)}, minmax(0, 1fr))`,
            }}
          >
            {plansData.map((plan, index) => (
              <PricingCard key={index} plan={plan} />
            ))}
          </div>
          {packageError && (
            <p className='text-center text-red-600 text-sm mt-4'>
              {packageError}
            </p>
          )}
        </section>

        <section className='container mx-auto bg-background px-6 pb-24'>
          <div className='mx-auto mb-12 max-w-6xl text-center'>
            <h2 className='text-4xl font-bold tracking-tighter text-foreground'>
              {demoMode === 'generation'
                ? t('pricing.generation_rates_title', 'Generation credit costs')
                : t('pricing.pay_as_you_go.title')}
            </h2>
            <p className='mt-3 max-w-3xl mx-auto text-lg text-muted-foreground'>
              {demoMode === 'generation'
                ? t(
                    'pricing.generation_rates_description',
                    'Each completed job draws down a predictable number of credits.',
                  )
                : t('pricing.pay_as_you_go.description')}
            </p>
            {demoMode === 'generation' ? (
              <div className='mt-8 grid gap-4 text-left sm:grid-cols-2 lg:grid-cols-3'>
                {GENERATION_SKUS.map((sku) => (
                  <div
                    key={sku.id}
                    className='rounded-xl border border-border bg-card p-5'
                  >
                    <p className='text-sm font-medium capitalize text-purple'>
                      {sku.modality}
                    </p>
                    <div className='mt-2 flex items-start justify-between gap-3'>
                      <h3 className='font-semibold text-foreground'>
                        {sku.label}
                      </h3>
                      <span className='whitespace-nowrap font-semibold text-foreground'>
                        {sku.credits} {t('common.credits', 'credits')}
                      </span>
                    </div>
                    <p className='mt-2 text-sm text-muted-foreground'>
                      {sku.description}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <PayAsYouGoPricingTable />
            )}
          </div>
        </section>

        <FaqSection faqs={faqs} />

        {showUpgradePaymentModal && (
          <SubscribePricingPlanEmbeddedDialog
            open={showUpgradePaymentModal}
            isUpgrade
            onClose={() => setShowUpgradePaymentModal(false)}
          />
        )}

        <SubscribeMetronomePackageDialog
          open={!!selectedPackageId}
          packageId={selectedPackageId}
          onClose={() => setSelectedPackageId(null)}
        />
      </main>
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={<LoadingOverlay />}>
      <PricingPageContent />
    </Suspense>
  );
}
