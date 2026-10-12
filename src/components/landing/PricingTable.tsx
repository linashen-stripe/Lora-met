import React, { useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { CheckIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useConfigContext } from '@/contexts/ConfigContext';
import { formatPrice } from '@/utils/helpers';
import fetchClient from '@/utils/fetchClient';

interface Prices {
  plus: string;
  pro: string;
  // teamAnnual: string;
  teamMonthly: string;
}

interface MarketingFeature {
  name: string;
}

interface Product {
  name: string;
  marketing_features: MarketingFeature[];
}

interface Products {
  plus: Product | null;
  pro: Product | null;
  team: Product | null;
}

const PricingTable = () => {
  const { t } = useTranslation();
  const { settings } = useConfigContext();
  const [prices, setPrices] = useState<Prices>({
    plus: t('loading'),
    pro: t('loading'),
    // teamAnnual: t('loading'),
    teamMonthly: t('loading'),
  });
  const [products, setProducts] = useState<Products>({
    plus: null,
    pro: null,
    team: null,
  });

  useEffect(() => {
    if (!settings) return;

    // Pricing is now handled through pricing plans
    // Set empty products
    setProducts({
      plus: null,
      pro: null,
      team: null,
    });
  }, [settings?.language, settings?.currency]);

  const plans = [
    {
      link: `/${settings?.language}/auth/sign-up?plan=free`,
      name: t('pricing.plans.free.name'),
      price: formatPrice(0, settings?.language, settings?.currency),
      features: [
        t('pricing.plans.free.features.basic_access'),
        t('pricing.plans.free.features.limited_usage'),
        t('pricing.plans.free.features.community_support'),
      ],
      buttonText: t('pricing.plans.free.button'),
      buttonStyle: 'bg-foreground text-white hover:bg-foreground-hover',
    },
    {
      link: `/${settings?.language}/auth/sign-up?plan=pricing-plan-pro`,
      name: products.pro?.name || t('pricing.plans.pro.name'),
      price: t('pricing.plans.pro.price', { price: prices.pro }),
      features: products.pro?.marketing_features?.map(
        (feature: MarketingFeature) => t(feature.name),
      ),
      footnote: t('pricing.plans.pro.features.footnote'),
      buttonText: t('pricing.plans.pro.button'),
      buttonStyle: 'bg-foreground text-white hover:bg-foreground-hover',
    },

    // Enterprise plan remains unchanged as it doesn't have dynamic pricing
    {
      link: `/${settings?.language}/contact-us`,
      name: t('pricing.plans.enterprise.name'),
      price: t('pricing.plans.enterprise.price'),
      features: [
        t('pricing.plans.enterprise.features.everything_team'),
        t('pricing.plans.enterprise.features.higher_limits'),
        t('pricing.plans.enterprise.features.context_windows'),
        t('pricing.plans.enterprise.features.sso_rbac'),
        t('pricing.plans.enterprise.features.audit_logs'),
        t('pricing.plans.enterprise.features.integrations'),
      ],
      buttonText: t('pricing.plans.enterprise.button'),
      buttonStyle: 'bg-purple hover:bg-purple-hover text-button-color',
    },
  ];

  return (
    <div className='bg-background py-16 pb-40'>
      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
        <h2 className='text-text-color text-3xl font-bold text-center mb-12'>
          {t('pricing.title')}
        </h2>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6'>
          {plans.map((plan) => (
            <div
              key={plan.name}
              className='bg-white rounded-lg shadow-md p-6 flex flex-col'
            >
              {' '}
              <h3 className='text-xl font-semibold mb-2 text-gray-900'>
                {plan.name}
              </h3>
              <p className='text-gray-600 mb-4'>{plan.price}</p>
              <ul className='mb-6 flex-grow'>
                {plan.features?.map((feature, index) => (
                  <li key={index} className='flex items-start mb-2'>
                    <CheckIcon className='h-5 w-5 text-purple mr-2 flex-shrink-0' />
                    <span className='text-gray-800'>{feature}</span>
                  </li>
                ))}
              </ul>
              {plan.footnote && (
                <p className='text-xs text-gray-500 mb-4'>{plan.footnote}</p>
              )}
              <Link href={plan.link} key={plan.name}>
                <button
                  className={`${plan.buttonStyle} py-2 px-4 rounded-md font-medium transition duration-300 text-center w-full`}
                >
                  {plan.buttonText}
                </button>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PricingTable;
