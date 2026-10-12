import { Code, BarChart3, Zap, Shield, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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

// Feature Card component
const FeatureCard = ({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) => (
  <div className='group relative rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1'>
    <div className='absolute inset-0 rounded-xl bg-gradient-to-r from-gray-50/0 to-gray-100/0 group-hover:from-gray-50/50 group-hover:to-gray-100/50 transition-all duration-300'></div>
    <div className='relative'>
      <div className='mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 group-hover:bg-gray-200 transition-all duration-300'>
        <Icon className='h-6 w-6 text-gray-700' />
      </div>
      <h3 className='mb-2 text-xl font-bold text-gray-900'>{title}</h3>
      <p className='text-gray-600 leading-relaxed'>{description}</p>
    </div>
  </div>
);

export default function FeaturesSection() {
  const { t } = useTranslation();

  const features = [
    {
      icon: Code,
      title: t('features.ai_code_generation.title'),
      description: t('features.ai_code_generation.description'),
    },
    {
      icon: BarChart3,
      title: t('features.usage_based_billing.title'),
      description: t('features.usage_based_billing.description'),
    },
    {
      icon: Zap,
      title: t('features.instant_deployment.title'),
      description: t('features.instant_deployment.description'),
    },
    {
      icon: Shield,
      title: t('features.transparent_fair.title'),
      description: t('features.transparent_fair.description'),
    },
  ];

  return (
    <Section className='pb-24'>
      <div className='mb-16 text-center'>
        <h2 className='text-4xl font-bold tracking-tight text-foreground'>
          {t('features.title')}
        </h2>
        <p className='mx-auto mt-4 max-w-2xl text-xl text-muted-foreground'>
          {t('features.description')}
        </p>
      </div>
      <div className='grid gap-8 md:grid-cols-2 lg:grid-cols-4'>
        {features.map((feature) => (
          <FeatureCard key={feature.title} {...feature} />
        ))}
      </div>
    </Section>
  );
}
