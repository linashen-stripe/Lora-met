'use client';

/**
 * Static v1 pricing mock at /[locale]/pricing/v1 — self-contained (does not use shared PricingCard).
 */
import { useConfigContext } from '@/contexts/ConfigContext';
import { formatPrice } from '@/utils/helpers';
import V1PricingCard, { type V1Plan } from './V1PricingCard';

export default function PricingV1Page() {
  const { settings } = useConfigContext();
  const lang = settings?.language || 'en';
  const currency = settings?.currency || 'usd';

  const ctaClass =
    'w-full mt-8 text-base py-3 bg-accent text-accent-foreground hover:bg-purple-hover transition-colors duration-200';

  const plans: V1Plan[] = [
    {
      name: 'Free',
      price: formatPrice(0, lang, currency),
      priceDetails: '/month',
      description:
        'Get started at no cost. Try core workflows, invite your team, and move to a paid plan when you are ready to scale.',
      features: [
        'Core product access for individuals and small teams',
        'Standard onboarding and help content',
        'Community support',
        'Clear upgrade path when you need more capacity or features',
      ],
      ctaText: 'Start for free',
      ctaClassName: ctaClass,
      isPopular: false,
    },
    {
      name: 'Pro',
      price: formatPrice(2000, lang, currency),
      priceDetails: '/month',
      description:
        'For professionals and growing teams who need reliability, faster support, and room to grow.',
      features: [
        'Everything in Free',
        'Priority email support',
        'Higher usage limits and throughput',
        'Team collaboration and admin basics',
        'Usage and analytics for your workspace',
      ],
      ctaText: 'Choose Pro',
      ctaClassName: ctaClass,
      isPopular: true,
    },
    {
      name: 'Premium',
      price: formatPrice(9900, lang, currency),
      priceDetails: '/month',
      description:
        'For organizations that need advanced controls, security expectations, and a closer relationship with our team.',
      features: [
        'Everything in Pro',
        'Advanced security and compliance options',
        'SSO and finer-grained access controls',
        'Dedicated onboarding and success resources',
        'Custom terms and invoicing where required',
      ],
      ctaText: 'Choose Premium',
      ctaClassName: ctaClass,
      isPopular: false,
    },
  ];

  return (
    <div className='flex min-h-screen flex-col bg-background text-foreground'>
      <main className='flex-1'>
        <section className='container mx-auto px-6 py-10 text-center'>
          <h1 className='mb-4 text-5xl font-semibold tracking-tight text-foreground'>
            Pricing
          </h1>
          <p className='mx-auto max-w-2xl text-md text-muted-foreground'>
            Simple, transparent pricing for everyone. Start free and scale as you
            grow.
          </p>
        </section>

        <section className='container mx-auto px-6 pb-20'>
          <div className='mx-auto grid max-w-6xl grid-cols-1 gap-8 items-stretch md:grid-cols-3'>
            {plans.map((plan, index) => (
              <V1PricingCard key={index} plan={plan} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
