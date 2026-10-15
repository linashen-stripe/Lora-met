'use client';

import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import { useConfigContext } from '@/contexts/ConfigContext';
import EmbeddedCheckout, {
  EMBEDDED_CHECKOUT_DIALOG_PANEL_CLASS,
} from '@/components/checkout/EmbeddedCheckout';
import MetronomePackageCheckoutSidebar, {
  type MetronomePackageSummary,
} from '@/components/subscribe/MetronomePackageCheckoutSidebar';

export type SeedPersonaCheckoutData = {
  clientSecret: string;
  sessionId: string;
  package: MetronomePackageSummary;
};

export default function SeedPersonaCheckoutDialog({
  checkout,
  onClose,
}: {
  checkout: SeedPersonaCheckoutData | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { settings } = useConfigContext();

  if (!checkout || !settings) return null;

  const handleComplete = () => {
    window.location.href =
      `/api/stripe/upgrade-checkout/success?session_id=${encodeURIComponent(
        checkout.sessionId,
      )}`;
  };

  return (
    <Dialog open onClose={onClose} className='relative z-50'>
      <DialogBackdrop
        transition
        className='fixed inset-0 z-40 h-screen w-screen bg-gray-500 bg-opacity-75 transition-opacity data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in'
      />
      <div className='fixed inset-0 z-50 w-screen overflow-y-auto'>
        <div className='flex min-h-full items-center justify-center p-4 sm:p-6'>
          <DialogPanel
            transition
            className={EMBEDDED_CHECKOUT_DIALOG_PANEL_CLASS}
          >
            <div className='absolute right-0 top-0 z-10 pr-3 pt-3'>
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
              {t('subscribe_metronome_package.order_summary')}
            </DialogTitle>
            <div className='w-full flex-1 overflow-y-auto'>
              <EmbeddedCheckout
                compact
                checkoutData={checkout}
                sidebar={
                  <MetronomePackageCheckoutSidebar
                    pkg={checkout.package}
                    language={settings.language}
                    currency={settings.currency}
                    isLoading={false}
                  />
                }
                // @ts-expect-error - Settings type never matched the checkout prop type.
                settings={settings}
                onComplete={handleComplete}
              />
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}
