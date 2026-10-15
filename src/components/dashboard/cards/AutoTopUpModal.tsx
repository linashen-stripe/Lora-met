'use client';

import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import fetchClient from '@/utils/fetchClient';
import { useConfigContext } from '@/contexts/ConfigContext';
import { getEffectiveMetronomeCustomerId } from '@/config/metronomeDefaults';
import { useTranslation } from 'react-i18next';
import Button from '@/components/ui/Button';
import { formatPrice } from '@/utils/helpers';
import {
  formatMetronomeAmount,
  isCustomMetronomeCreditType,
} from '@/utils/metronomeAmount';
import { GENERATION_CREDIT_USD } from '@/config/generationCatalog';
import {
  METRONOME_CATALOG,
  packageByKey,
} from '@/config/metronomeCatalog';
import { AI_BUILDER_PRO_TERMS } from '@/config/aiBuilderCatalog';

interface AutoTopUpModalProps {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}

export default function AutoTopUpModal({ open, setOpen }: AutoTopUpModalProps) {
  const { t } = useTranslation();
  const {
    customer,
    settings,
    metronomeContract,
    demoMode,
    triggerMetronomeContractRefresh,
  } = useConfigContext();
  const contractCreditTypeName = metronomeContract?.creditTypeName;
  const customCreditTypeName =
    demoMode === 'generation' &&
    (!contractCreditTypeName ||
      isCustomMetronomeCreditType(contractCreditTypeName))
      ? contractCreditTypeName ?? METRONOME_CATALOG.pricingUnit.name
      : undefined;
  const metronomeCustomerId = getEffectiveMetronomeCustomerId(customer);
  const [threshold, setThreshold] = useState('');
  const [topUpAmount, setTopUpAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const thresholdValue = Number(threshold);
  const rechargeValue = Number(topUpAmount);
  const customCreditFiatMinorUnits =
    METRONOME_CATALOG.pricingUnit.fiatMinorUnitsPerCustomCredit;
  const minimumThreshold = customCreditTypeName
    ? Math.ceil(500 / customCreditFiatMinorUnits)
    : 5;
  const minimumRechargeGap = customCreditTypeName
    ? Math.ceil(1000 / customCreditFiatMinorUnits)
    : 10;
  const amountsAreValid =
    threshold !== '' &&
    topUpAmount !== '' &&
    Number.isFinite(thresholdValue) &&
    Number.isFinite(rechargeValue) &&
    thresholdValue >= minimumThreshold &&
    rechargeValue >= thresholdValue + minimumRechargeGap;

  useEffect(() => {
    if (!open) return;
    if (demoMode === 'generation') {
      const proPackage = packageByKey('pro');
      setThreshold(String(proPackage?.autoTopUpThresholdCredits ?? ''));
      setTopUpAmount(String(proPackage?.autoTopUpToCredits ?? ''));
    } else {
      setThreshold(
        String(AI_BUILDER_PRO_TERMS.autoTopUpThresholdCents / 100),
      );
      setTopUpAmount(
        String(AI_BUILDER_PRO_TERMS.autoTopUpToCents / 100),
      );
    }
    setError(null);
  }, [demoMode, open]);

  const handleSave = async () => {
    if (!amountsAreValid) {
      setError(
        t('modals.auto_top_up.invalid_amounts', {
          defaultValue:
            customCreditTypeName
              ? `Metronome requires a threshold of at least ${minimumThreshold.toLocaleString()} ${customCreditTypeName} and a recharge target at least ${minimumRechargeGap.toLocaleString()} credits higher.`
              : 'Metronome requires a threshold of at least $5.00 and a recharge target at least $10.00 higher.',
        }),
      );
      return;
    }
    if (!metronomeCustomerId) {
      setError(
        'A Metronome customer is required before auto top-up can be configured.',
      );
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const thresholdAmount = Math.round(
        Number(threshold) * (customCreditTypeName ? 1 : 100),
      );
      const rechargeAmount = Math.round(
        Number(topUpAmount) * (customCreditTypeName ? 1 : 100),
      );

      await fetchClient.post('/api/metronome/notifications', {
        metronomeCustomerId,
        thresholdAmount,
        rechargeAmount,
      });
      await triggerMetronomeContractRefresh();

      setOpen(false);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save settings.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
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
                <span className='sr-only'>{t('common.close')}</span>
                <XMarkIcon className='h-6 w-6' aria-hidden='true' />
              </button>
            </div>
            <DialogTitle
              as='h3'
              className='text-lg font-medium leading-6 text-gray-900 mb-4'
            >
              {t('modals.auto_top_up.title')}
            </DialogTitle>
            <div className='mt-2 space-y-4'>
              {error && <p className='text-red-500'>{error}</p>}
              <div className='rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900'>
                {customCreditTypeName ? (
                  <p>
                    Metronome requires at least{' '}
                    {minimumThreshold.toLocaleString()} {customCreditTypeName}{' '}
                    for the threshold and a recharge target at least{' '}
                    {minimumRechargeGap.toLocaleString()} credits higher.
                    For example, if your threshold is{' '}
                    {minimumThreshold.toLocaleString()} credits, your recharge
                    to amount must be at least{' '}
                    {(
                      minimumThreshold + minimumRechargeGap
                    ).toLocaleString()}{' '}
                    credits.
                  </p>
                ) : (
                  <p>
                    Metronome requires a threshold of at least $5.00 and a
                    recharge target at least $10.00 higher. For example, if your
                    threshold is $5, your recharge to amount must be at least
                    $15.
                  </p>
                )}
              </div>
              {customCreditTypeName && (
                <div className='rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900'>
                  <p className='font-medium'>
                    1 {customCreditTypeName} ={' '}
                    {formatPrice(
                      GENERATION_CREDIT_USD * 100,
                      settings?.language,
                      settings?.currency,
                    )}
                  </p>
                  <p className='mt-1 text-xs text-violet-700'>
                    You are charged only for the credits added to restore the
                    balance to your target.
                  </p>
                </div>
              )}
              <div>
                <label
                  htmlFor='threshold'
                  className='block text-sm font-medium text-gray-700'
                >
                  {t('modals.auto_top_up.balance_threshold_label')}
                  {customCreditTypeName && (
                    <span className='ml-1 text-gray-500'>
                      ({customCreditTypeName})
                    </span>
                  )}
                </label>
                <input
                  type='number'
                  min={minimumThreshold}
                  step='1'
                  name='threshold'
                  id='threshold'
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  className='mt-1 block w-full rounded-md border border-gray-300 shadow-sm focus:border-purple focus:ring-purple text-base py-3 px-4'
                  placeholder={customCreditTypeName ? '1,000' : '0.00'}
                />
              </div>
              <div>
                <label
                  htmlFor='topUpAmount'
                  className='block text-sm font-medium text-gray-700'
                >
                  {t('modals.auto_top_up.top_up_amount_label')}
                  {customCreditTypeName && (
                    <span className='ml-1 text-gray-500'>
                      ({customCreditTypeName})
                    </span>
                  )}
                </label>
                <input
                  type='number'
                  min={thresholdValue + minimumRechargeGap}
                  step='1'
                  name='topUpAmount'
                  id='topUpAmount'
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  className='mt-1 block w-full rounded-md border border-gray-300 shadow-sm focus:border-purple focus:ring-purple text-base py-3 px-4'
                  placeholder={customCreditTypeName ? '5,000' : '0.00'}
                />
              </div>
            </div>

            {/* Disclaimer */}
            {threshold && topUpAmount && (
              <div className='mt-4 p-3 bg-gray-50 border border-gray-200 rounded-md'>
                <p className='text-sm text-gray-600'>
                  {t('modals.auto_top_up.disclaimer', {
                    topUpAmount: customCreditTypeName
                      ? formatMetronomeAmount(
                          Number(topUpAmount),
                          customCreditTypeName,
                          settings?.language,
                          settings?.currency,
                        )
                      : formatPrice(
                          Number(topUpAmount) * 100,
                          settings?.language,
                          settings?.currency,
                        ),
                    threshold: customCreditTypeName
                      ? formatMetronomeAmount(
                          Number(threshold),
                          customCreditTypeName,
                          settings?.language,
                          settings?.currency,
                        )
                      : formatPrice(
                          Number(threshold) * 100,
                          settings?.language,
                          settings?.currency,
                        ),
                  })}
                </p>
              </div>
            )}

            <div className='mt-6'>
              <Button
                isLoading={isLoading}
                onClick={handleSave}
                text={t('config.save_settings')}
                disabled={isLoading || !amountsAreValid}
              />
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}
