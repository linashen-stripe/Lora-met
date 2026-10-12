import { useConfigContext } from '@/contexts/ConfigContext';
import { useTranslation } from 'next-i18next';
import Link from 'next/link';

export default function EnterpriseHero() {
  const { t } = useTranslation();
  const { settings } = useConfigContext();

  return (
    <>
      <header className='w-full bg-background py-12'>
        <div className='mx-auto max-w-7xl px-6 lg:px-8 relative'>
          <div className='flex flex-col lg:flex-row items-center'>
            {/* Background image */}
            <div className='w-1/3 mb-8 lg:mb-0 lg:mr-12 flex justify-center items-center'>
              <img
                src='./img/robot-2.png'
                alt='Enterprise'
                className='w-3/4 object-cover'
              />
            </div>

            <div className='lg:w-2/3 relative z-10 flex items-center'>
              <div className='w-full lg:w-auto max-w-2xl mx-auto lg:mx-0 text-center lg:text-left'>
                <h2 className='text-4xl lg:text-5xl font-bold tracking-tight text-text-color mb-6'>
                  {t('enterprise.title')}
                </h2>
                <p className='text-lg lg:text-xl text-text-color mb-8 mx-auto lg:mx-0 max-w-lg'>
                  {t('enterprise.description')}
                </p>
                <div className='flex justify-center lg:justify-start'>
                  <Link
                    href={`/${settings?.language}/contact-us`}
                    className='bg-purple hover:bg-purple-hover text-button-color text-lg font-medium py-3 px-6 rounded-md transition duration-300'
                  >
                    {t('enterprise.cta')}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
