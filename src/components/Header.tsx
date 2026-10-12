import { useConfigContext } from '@/contexts/ConfigContext';
import { useTranslation } from 'next-i18next';
import Link from 'next/link';

export default function Header() {
  const { t } = useTranslation();
  const { settings } = useConfigContext();

  return (
    <>
      <header className='w-full bg-background py-24 sm:py-32'>
        <div className='mx-auto max-w-7xl px-6 lg:px-8 relative'>
          <div className='mx-auto max-w-2xl lg:mx-0 relative z-10'>
            <h2 className='text-4xl font-bold tracking-tight text-text-color sm:text-5xl mb-8'>
              {t('header.hero.title')}
            </h2>

            {/* Model List */}
            <div className='flex space-x-4'>
              <div className='bg-card rounded-lg shadow-md p-6 flex flex-col w-1/2'>
                <div className='flex items-center mb-2'>
                  <span className='bg-purple text-button-color text-xs font-bold px-2 py-1 rounded'>
                    {t('header.hero.new')}
                  </span>
                </div>
                <h2 className='text-2xl font-bold mb-2 text-card-foreground'>
                  {t('header.hero.new_title')}
                </h2>
                <p className='text-muted-foreground mb-4'>
                  {t('header.hero.new_description')}
                </p>
                <Link
                  href={`/${settings?.language}/auth/sign-up`}
                  className='text-center mt-auto bg-foreground text-background py-2 px-4 rounded-md hover:bg-foreground-hover transition duration-300'
                >
                  {t('header.hero.new_button')}
                </Link>
              </div>

              <div className='bg-card rounded-lg shadow-md p-6 flex flex-col w-1/2'>
                <div className='flex items-center mb-2'>
                  <span className='bg-foreground text-background text-xs font-bold px-2 py-1 rounded'>
                    {t('header.hero.api')}
                  </span>
                </div>
                <h2 className='text-2xl font-bold mb-2 text-card-foreground'>
                  {t('header.hero.api_title')}
                </h2>
                <p className='text-muted-foreground mb-4'>
                  {t('header.hero.api_description')}
                </p>
                <Link
                  href={`/${settings?.language}/auth/sign-up?plan=api`}
                  className='text-center mt-auto border border-border text-foreground py-2 px-4 rounded-md hover:bg-muted transition duration-300'
                >
                  {t('header.hero.api_button')}
                </Link>
              </div>
            </div>
          </div>

          {/* Background image */}
          <div className='absolute -top-16 -right-16 z-0 px-8 hidden lg:block'>
            <div className='w-3/4 h-3/4 rounded-lg overflow-hidden mt-12'>
              <img
                src='./img/chip-2.png'
                alt='AI chip'
                className='w-full h-full object-cover'
              />
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
