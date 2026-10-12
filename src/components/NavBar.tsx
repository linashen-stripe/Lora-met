import { useConfigContext } from '@/contexts/ConfigContext';
import { defaultDemoSettings } from '@/config/config';
import { Disclosure } from '@headlessui/react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import Logo from './ui/Logo';

export default function NavBar() {
  const { t } = useTranslation();
  const { customer, settings, demoMode } = useConfigContext();
  const locale = settings?.language ?? defaultDemoSettings.language;
  const activeDemoHref = demoMode === 'ai-builder'
    ? `/${locale}/demos/ai-builder`
    : `/${locale}/demos/generation`;

  return (
    <Disclosure as='nav' className='bg-background'>
      <div className='mx-auto px-2 sm:px-6 lg:px-8'>
        <div className='relative flex h-16 items-center justify-between'>
          <div className='flex-1' />

          {/* Centered logo */}
          <div className='flex-1 flex items-center justify-center'>
            <div className='flex flex-shrink-0 items-center'>
              <Link
                href={`/${locale}`}
                className='flex items-center justify-center'
              >
                <Logo />
              </Link>
            </div>
          </div>

          {/* Right-aligned settings button */}
          <div className='flex-1 flex items-center justify-end'>
            {customer && customer.id ? (
              <>
                <Link
                  href={`/${locale}/pricing?demoMode=${demoMode}`}
                  type='button'
                  className='rounded-full bg-background p-1 mr-5 text-text-color'
                >
                  <span>{t('header.main_nav.pricing')}</span>
                </Link>
                <Link
                  href={activeDemoHref}
                  type='button'
                  className='rounded-full bg-background p-1 mr-5 text-text-color'
                >
                  <span>{t('header.main_nav.chat')}</span>
                </Link>
                <Link
                  href={`/${locale}/dashboard?demoMode=${demoMode}`}
                  type='button'
                  className='rounded-full bg-background p-1 mr-5 text-text-color'
                >
                  <span>{t('header.main_nav.account')}</span>
                </Link>
                <Link
                  href={`/${locale}/auth/sign-out`}
                  type='button'
                  className='rounded-full bg-background p-1 text-text-color'
                >
                  <span>{t('header.main_nav.sign-out')}</span>
                </Link>
              </>
            ) : (
              <>
                <Link
                  href={`/${locale}/pricing?demoMode=${demoMode}`}
                  type='button'
                  className='rounded-full bg-background p-1 mr-5 text-text-color'
                >
                  <span>{t('header.main_nav.pricing')}</span>
                </Link>
                <Link
                  href={`/${locale}/auth/sign-in?demoMode=${demoMode}`}
                  type='button'
                  className='rounded-full bg-background p-1 text-text-color'
                >
                  <span>{t('header.main_nav.sign_in')}</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </Disclosure>
  );
}
