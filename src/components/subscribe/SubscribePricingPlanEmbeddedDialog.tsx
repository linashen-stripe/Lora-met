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
import EmbeddedCheckoutComponent, {
  EMBEDDED_CHECKOUT_DIALOG_PANEL_CLASS,
} from '@/components/checkout/EmbeddedCheckout';
import useEmbeddedPricingPlanCheckout from '@/components/subscribe/useEmbeddedPricingPlanCheckout';

const SubscribePricingPlanEmbeddedDialogContent = ({
  isLoading,
  isProcessing,
  error = 'Could not create embedded checkout session, you may not be signed in.',
  checkoutData,
  handleComplete,
}: {
  isLoading: boolean;
  isProcessing: boolean;
  error: string | null;
  checkoutData: any;
  handleComplete: () => void;
}) => {
  const { t } = useTranslation();
  const { settings } = useConfigContext();

  if (error) {
    return (
      <div className='flex flex-col items-center justify-center min-h-[400px] py-8'>
        <div className='text-red-500'>{t('auth.errors.checkout_session')}</div>
      </div>
    );
  }

  if (isLoading || !checkoutData || isProcessing) {
    return (
      <div className='flex flex-col items-center justify-center min-h-[400px] py-8'>
        <Spinner />
        <p className='mt-4 text-lg font-semibold text-text-color'>
          {isProcessing ? t('common.processing') : t('common.loading')}
        </p>
      </div>
    );
  }

  return (
    <EmbeddedCheckoutComponent
      compact
      checkoutData={checkoutData}
      // @ts-expect-error - Settings type never matched the Prop settings type
      settings={settings}
      onComplete={handleComplete}
    />
  );
};

const SubscribePricingPlanEmbeddedDialog = ({
  open,
  isUpgrade,
  onClose,
}: {
  open: boolean;
  isUpgrade?: boolean;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const { isLoading, isProcessing, error, checkoutData, handleComplete } =
    useEmbeddedPricingPlanCheckout({
      isUpgrade,
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
            className={EMBEDDED_CHECKOUT_DIALOG_PANEL_CLASS}
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
              {t('settings.subscription.upgrade')}
            </DialogTitle>
            <div className='w-full overflow-y-auto flex-1'>
              <SubscribePricingPlanEmbeddedDialogContent
                isLoading={isLoading}
                isProcessing={isProcessing}
                error={error}
                checkoutData={checkoutData}
                handleComplete={handleComplete}
              />
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
};

export default SubscribePricingPlanEmbeddedDialog;
