'use client';

/**
 * Standalone pricing card for /pricing/v1 — duplicated from components/pricing/PricingCard
 * (visual mock: no credit row, non-interactive CTA). Do not import shared PricingCard.
 */
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Check, Sparkles } from 'lucide-react';

export interface V1Plan {
  name: string;
  price: string;
  priceDetails: string | null;
  description: string;
  features: string[];
  ctaText: string;
  ctaClassName: string;
  isPopular?: boolean;
}

export default function V1PricingCard({ plan }: { plan: V1Plan }) {
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
            <span>Most popular</span>
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
          {plan.features.map((feature, i) => (
            <li key={i} className='flex items-start'>
              <Check className='h-5 w-5 text-primary mr-2 flex-shrink-0 mt-1' />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        <div
          className={`flex items-center justify-center rounded-md px-4 h-11 shadow-sm cursor-default select-none pointer-events-none ${plan.ctaClassName}`}
        >
          {plan.ctaText}
        </div>
      </CardContent>
    </Card>
  );
}
