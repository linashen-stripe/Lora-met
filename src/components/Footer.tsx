import { useConfigContext } from '@/contexts/ConfigContext';
import { useTranslation } from 'react-i18next';
import { getTextColor } from '@/utils/helpers';

const navigation = {
  solutions: [
    { name: 'footer.solutions.api', href: '#' },
    { name: 'footer.solutions.team', href: '#' },
    { name: 'footer.solutions.pricing', href: '#' },
    { name: 'footer.solutions.research', href: '#' },
    { name: 'footer.solutions.company', href: '#' },
  ],
  support: [
    { name: 'footer.support.press', href: '#' },
    { name: 'footer.support.support', href: '#' },
    { name: 'footer.support.status', href: '#' },
    { name: 'footer.support.availability', href: '#' },
  ],
  company: [
    { name: 'footer.company.terms', href: '#' },
    { name: 'footer.company.privacy', href: '#' },
    { name: 'footer.company.usage', href: '#' },
    { name: 'footer.company.compliance', href: '#' },
    { name: 'footer.company.disclosure', href: '#' },
  ],
};

export default function Footer() {
  const { t } = useTranslation();
  const { settings } = useConfigContext();

  // Determine which logo to use based on background color
  const backgroundColor = settings?.secondaryColor || '#f1eeee';
  const textColor = getTextColor(backgroundColor);
  const isDarkBackground = textColor === '#FFFFFF';
  const logoSrc = isDarkBackground
    ? '/img/icon/lora-logo.svg'
    : '/img/icon/lora-logo-dark.svg';

  return (
    <footer
      aria-labelledby='footer-heading'
      className='bg-foreground text-background'
    >
      <div className='mx-auto max-w-7xl px-6 py-16 sm:py-24 lg:px-8 lg:py-32'>
        <div className='xl:grid xl:grid-cols-3 xl:gap-8'>
          {!settings?.customLogo && (
            <img
              src={logoSrc}
              alt={t('footer.logo_alt')}
              width={120}
              height={32}
            />
          )}
          <div className='mt-4 md:mt-16 grid grid-cols-2 gap-8 xl:col-span-2 xl:mt-0'>
            <div className='md:grid md:grid-cols-2 md:gap-8'>
              <div>
                <ul role='list' className='mt-6 space-y-4'>
                  {navigation.solutions.map((item) => (
                    <li key={item.name}>
                      <a
                        href={item.href}
                        className='text-sm leading-6 text-background opacity-75 hover:opacity-100'
                      >
                        {t(item.name)}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div className='mt-10 md:mt-0'>
                <ul role='list' className='mt-6 space-y-4'>
                  {navigation.support.map((item) => (
                    <li key={item.name}>
                      <a
                        href={item.href}
                        className='text-sm leading-6 text-background opacity-75 hover:opacity-100'
                      >
                        {t(item.name)}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className='md:grid md:grid-cols-2 md:gap-8'>
              <div>
                <ul role='list' className='mt-6 space-y-4'>
                  {navigation.company.map((item) => (
                    <li key={item.name}>
                      <a
                        href={item.href}
                        className='text-sm leading-6 text-background opacity-75 hover:opacity-100'
                      >
                        {t(item.name)}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
