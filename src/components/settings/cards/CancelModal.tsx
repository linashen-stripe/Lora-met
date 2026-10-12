'use client';

import { Dispatch, SetStateAction } from 'react';
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import fetchClient from '@/utils/fetchClient';
import { useConfigContext } from '@/contexts/ConfigContext';
import { useTranslation } from 'react-i18next';
import Stripe from 'stripe';
import { useRouter } from 'next/navigation';

interface CancelModalProps {
  subscription: Stripe.Subscription;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  type: string;
}

export default function CancelModal({
  subscription,
  open,
  setOpen,
  type,
}: CancelModalProps) {
  const { t } = useTranslation();
  const { updateCustomer, settings } = useConfigContext();
  const router = useRouter();

  const handleClose = () => {
    setOpen(false);
  };

  const applyDiscount = async () => {
    // Legacy subscription discount no longer supported
    console.error('Legacy subscription discount is no longer available.');
    setOpen(false);
  };

  const cancel = async () => {
    await fetchClient.delete(`/api/stripe/${type}/${subscription.id}`);
    setOpen(false);
    updateCustomer({ forceSubscriptionRepoll: new Date() });
    router.push(`/${settings?.language}/auth/sign-out`);
  };

  return (
    <Dialog open={open} onClose={handleClose} className='relative z-10'>
      <DialogBackdrop
        transition
        className='fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in'
      />

      <div className='fixed inset-0 z-10 w-screen overflow-y-auto'>
        <div className='flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0'>
          <DialogPanel
            transition
            className='relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all data-[closed]:translate-y-4 data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in sm:my-8 sm:w-full sm:max-w-lg sm:p-6 data-[closed]:sm:translate-y-0 data-[closed]:sm:scale-95'
          >
            <div className='absolute right-0 top-0 pr-4 pt-4'>
              <button
                type='button'
                className='rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple focus:ring-offset-2'
                onClick={handleClose}
              >
                <span className='sr-only'>
                  {t('settings.cancellation.close')}
                </span>
                <XMarkIcon className='h-6 w-6' aria-hidden='true' />
              </button>
            </div>
            <DialogTitle
              as='h2'
              className='text-2xl font-bold text-gray-900 mb-2'
            >
              {t('settings.cancellation.beforeYouGo')}
            </DialogTitle>
            <div className='mt-2'>
              <p className='text-gray-600 mb-2'>
                {t('settings.cancellation.stayWithOffer')}
              </p>
              <p className='text-xl font-semibold text-gray-800 mb-4'>
                {t('settings.cancellation.offer')}
              </p>

              <div className={`space-y-3 mt-4`}>
                <div className='grid grid-cols-2 gap-3'>
                  <button
                    onClick={applyDiscount}
                    className='w-full py-3 bg-purple hover:bg-purple-hover text-button-color font-semibold rounded-md transition duration-300'
                  >
                    {t('settings.cancellation.claim')}
                  </button>
                  <button
                    onClick={cancel}
                    className='w-full py-3 border border-red-500 text-red-500 font-semibold rounded-md hover:bg-red-50 transition duration-300'
                  >
                    {t('settings.cancellation.cancel')}
                  </button>
                </div>
                <button
                  onClick={handleClose}
                  className='w-full py-3 bg-gray-800 hover:bg-gray-900 text-white font-semibold rounded-md transition duration-300'
                >
                  {t('settings.cancellation.keep')}
                </button>
              </div>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}
