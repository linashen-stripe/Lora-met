'use client';

import { Dispatch, SetStateAction, useState } from 'react';
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import fetchClient from '@/utils/fetchClient';
import { useConfigContext } from '@/contexts/ConfigContext';
import Spinner from '@/components/ui/Spinner';
import Button from '@/components/ui/Button';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';

interface CancelModalProps {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}
export default function CancelModal({ open, setOpen }: CancelModalProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const { customer, plan, subscription, triggerSubscriptionRefresh, settings } =
    useConfigContext();
  const [isProcessing, setIsProcessing] = useState(false);

  const hasPremiumPlan = plan?.lookupKey?.includes('premium');

  const handleClose = () => {
    setOpen(false);
  };

  const cancel = async () => {
    if (!customer || !subscription) {
      console.error('Customer or subscription not found');
      return;
    }

    if (!customer.stripeCustomerId) {
      console.error('Stripe customer not linked to this account');
      return;
    }

    // Set processing state to show loading spinner
    setIsProcessing(true);

    try {
      // Cancel the current subscription with automatic reenrollment
      await fetchClient.post('/api/stripe/pricing-plan-subscription/cancel', {
        customerId: customer.stripeCustomerId,
        pricingPlanSubscriptionId: subscription.id,
        billingCadenceId: subscription.billingCadenceId,
        // If we are cancelling a premium plan, we will automatically reenroll in the free plan
        enableAutomaticReenrollment: hasPremiumPlan,
      });

      if (!hasPremiumPlan) {
        // Refresh the subscription data
        await triggerSubscriptionRefresh();

        // Cleanup
        setOpen(false);
        setIsProcessing(false);
      } else {
        // Since we are cancelling a free plan, we just log the user out
        router.push(`/${settings?.language}/auth/sign-out`);
      }
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
      setIsProcessing(false);
    }
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
              {t('settings.cancellation.confirmTitle')}
            </DialogTitle>
            <div className='mt-2'>
              <p className='text-gray-600 mb-2'>
                {hasPremiumPlan
                  ? t('settings.cancellation.reenrolled_message')
                  : t('settings.cancellation.logged_out_message')}
              </p>

              <div className={`space-y-3 mt-4`}>
                <Button
                  onClick={cancel}
                  disabled={isProcessing}
                  className='w-full py-3 border bg-white border-red-500 text-red-500 font-semibold rounded-md hover:bg-red-50 transition duration-300'
                  text={t('settings.cancellation.cancel')}
                  icon={isProcessing ? <Spinner /> : null}
                />
                <Button
                  onClick={handleClose}
                  disabled={isProcessing}
                  className='w-full py-3 bg-gray-800 hover:bg-gray-900 text-gray-100 font-semibold rounded-md transition duration-300'
                  text={t('settings.cancellation.keep')}
                />
              </div>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}
