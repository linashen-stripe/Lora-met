import Image from 'next/image';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useConfigContext } from '@/contexts/ConfigContext';

// Section wrapper component
const Section = ({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <section className={`py-16 ${className}`}>
    <div className='container mx-auto px-6'>{children}</div>
  </section>
);

export default function TechnologyShowcase() {
  const { t } = useTranslation();
  const { settings } = useConfigContext();

  return (
    <Section className='border-y-0 bg-transparent'>
      <div className='flex flex-col items-start lg:items-center gap-16 lg:flex-row'>
        <div className='lg:order-2 lg:w-1/2 flex justify-center'>
          <div className='relative'>
            <div className='absolute -inset-12 rounded-full bg-purple/10 blur-3xl'></div>
            <Image
              src='/img/robot-2.png'
              alt={t('landing.technologies.robot_alt')}
              width={256}
              height={384}
              className='relative object-contain'
            />
          </div>
        </div>
        <div className='lg:order-1 lg:w-1/2'>
          <h2 className='mb-6 text-4xl font-bold tracking-tight text-foreground'>
            {t('landing.enterprise.title')}
          </h2>
          <p className='mb-8 text-lg text-muted-foreground leading-relaxed'>
            {t('landing.enterprise.description')}
          </p>
          <Link
            href={`/${settings?.language || 'en'}/contact-us`}
            className='inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-purple-hover transition-colors'
          >
            {t('landing.enterprise.cta')}
          </Link>
        </div>
      </div>
    </Section>
  );
}
