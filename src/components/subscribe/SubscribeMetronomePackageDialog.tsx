'use client';

import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'next-i18next';
import { useConfigContext } from '@/contexts/ConfigContext';
import Spinner from '@/components/ui/Spinner';
import EmbeddedCheckoutComponent from '@/components/checkout/EmbeddedCheckout';
import MetronomePackageCheckoutSidebar from '@/components/subscribe/MetronomePackageCheckoutSidebar';
import useMetronomePackageCheckout from '@/components/subscribe/useMetronomePackageCheckout';

const SubscribeMetronomePackageDialog = ({
  open,
  packageId,
  onClose,
}: {
  open: boolean;
  packageId: string | null;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const { settings, metronomeContract } = useConfigContext();
  const {
    isLoading,
    isProcessing,
    error,
    checkoutData,
    handleComplete,
    selectedPackage,
    packagesLoaded,
  } = useMetronomePackageCheckout({
    packageId,
    isUpgrade: Boolean(metronomeContract),
  });

  return (
    <Dialog open={open} onClose={onClose} className='relative z-50'>
      <DialogBackdrop
        transition
        className='fixed inset-0 h-screen w-screen bg-gray-500 bg-opacity-75 transition-opacity data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in z-40'
      />
      <div className='fixed inset-0 z-50 w-screen overflow-y-auto'>
        <div className='flex min-h-full items-center justify-center p-4 sm:p-6'>
          <DialogPanel
            transition
            className='relative transform overflow-hidden rounded-lg bg-background py-4 px-4 text-left shadow-xl transition-all data-[closed]:translate-y-4 data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in w-full max-w-6xl max-h-[90vh] flex flex-col data-[closed]:sm:translate-y-0 data-[closed]:sm:scale-95'
          >
            <div className='absolute right-0 top-0 pr-3 pt-3 z-10'>
              <button
                type='button'
                className='rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple focus:ring-offset-2'
                onClick={onClose}
              >
                <span className='sr-only'>{t('common.close')}</span>
                <XMarkIcon className='h-6 w-6' aria-hidden='true' />
              </button>
            </div>
            <DialogTitle as='h3' className='sr-only'>
              Get started
            </DialogTitle>
            <div className='w-full overflow-y-auto flex-1'>
              {error ? (
                <div className='flex flex-col items-center justify-center min-h-[400px] py-8'>
                  <div className='max-w-lg text-center text-red-500'>{error}</div>
                </div>
              ) : isLoading || !checkoutData || isProcessing ? (
                <div className='flex flex-col items-center justify-center min-h-[400px] py-8'>
                  <Spinner />
                  <p className='mt-4 text-lg font-semibold text-text-color'>
                    {isProcessing ? t('common.processing') : t('common.loading')}
                  </p>
                </div>
              ) : (
                <EmbeddedCheckoutComponent
                  compact
                  checkoutData={checkoutData}
                  sidebar={
                    packageId && settings ? (
                      <MetronomePackageCheckoutSidebar
                        pkg={selectedPackage}
                        language={settings.language}
                        currency={settings.currency}
                        isLoading={!packagesLoaded}
                      />
                    ) : undefined
                  }
                  // @ts-expect-error - Settings type never matched the Prop settings type
                  settings={settings}
                  onComplete={handleComplete}
                />
              )}
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
};

export default SubscribeMetronomePackageDialog;
