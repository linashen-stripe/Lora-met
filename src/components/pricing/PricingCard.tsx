'use client';

import Link from 'next/link';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import Button from '@/components/ui/Button';
import { Check, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface Plan {
  name: string;
  price: string;
  priceDetails: string | null;
  description: string;
  credit: {
    amount: string;
    description: string;
    amountClass: string;
    descriptionClass: string;
  };
  features: string[];
  button: {
    text: string;
    link?: string;
    onClick?: () => void;
    className: string;
    icon?: React.ReactNode;
    disabled?: boolean;
  };
  isPopular?: boolean;
}

interface PricingCardProps {
  plan: Plan;
}

export default function PricingCard({ plan }: PricingCardProps) {
  const { t } = useTranslation();

  return (
    <Card
      className={`bg-white rounded-lg shadow-md p-6 flex flex-col transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${
        plan.isPopular ? 'border-2 border-primary relative' : ''
      }`}
    >
      {plan.isPopular && (
        <div className='absolute top-0 -translate-y-1/2 left-1/2 -translate-x-1/2 z-10'>
          <div className='bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm shadow-lg flex items-center gap-x-1'>
            <Sparkles className='w-4 h-4' />
            <span>{t('most_popular')}</span>
          </div>
        </div>
      )}
      <CardHeader className='p-0'>
        <CardTitle className='text-xl font-semibold mb-2 text-gray-900'>
          {plan.name}
        </CardTitle>
        <div className='flex items-baseline'>
          <span className='text-4xl font-bold text-gray-900'>{plan.price}</span>
          {plan.priceDetails && (
            <span className='text-gray-600 ml-1'>{plan.priceDetails}</span>
          )}
        </div>
        <CardDescription className='text-base text-gray-600 pt-4 min-h-[72px]'>
          {plan.description}
        </CardDescription>
      </CardHeader>
      <CardContent className='p-0 mt-8 flex-1 flex flex-col justify-between'>
        <ul className='space-y-3 text-base text-gray-600'>
          <li className='flex items-start'>
            <Check className='h-5 w-5 text-primary mr-2 flex-shrink-0 mt-1' />
            <span>
              <strong>{plan.credit.amount}</strong> {plan.credit.description}
            </span>
          </li>
          {plan.features.map((feature, i) => (
            <li key={i} className='flex items-start'>
              <Check className='h-5 w-5 text-primary mr-2 flex-shrink-0 mt-1' />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        {plan.button.disabled || !plan.button.link ? (
          <Button
            text={plan.button.text}
            icon={plan.button.icon}
            onClick={plan.button.onClick || (() => {})}
            className={plan.button.className}
            disabled={plan.button.disabled}
          />
        ) : (
          <Link
            href={plan.button.link}
            className={`flex items-center justify-center rounded-md px-4 h-11 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple focus:ring-offset-2 focus:ring-offset-primary disabled:opacity-50 disabled:cursor-not-allowed ease-in-out ${plan.button.className}`}
          >
            {plan.button.text}
            {plan.button.icon && (
              <span className='ml-2'>{plan.button.icon}</span>
            )}
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
