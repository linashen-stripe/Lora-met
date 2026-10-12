'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface Faq {
  question: string;
  answer: ReactNode;
}

interface FaqSectionProps {
  faqs: Faq[];
}

export default function FaqSection({ faqs }: FaqSectionProps) {
  const { t } = useTranslation();

  return (
    <section className='container mx-auto px-6 pb-24'>
      <div className='text-center mb-12'>
        <h2 className='text-4xl font-bold tracking-tighter text-foreground'>
          {t('faq.title')}
        </h2>
      </div>
      <div className='max-w-3xl mx-auto'>
        <Accordion type='single' collapsible className='w-full'>
          {faqs.map((faq, i) => (
            <AccordionItem value={`item-${i}`} key={i}>
              <AccordionTrigger className='text-lg font-semibold'>
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className='text-lg'>
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
