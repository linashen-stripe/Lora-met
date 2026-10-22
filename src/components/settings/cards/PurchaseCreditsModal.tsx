'use client';

import {
  Dispatch,
  SetStateAction,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react';
import {
  XMarkIcon,
  ExclamationTriangleIcon,
  BoltIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import fetchClient from '@/utils/fetchClient';
import { useConfigContext } from '@/contexts/ConfigContext';
import { formatPrice } from '@/utils/helpers';
import { useTranslation } from 'react-i18next';
import {
  extractBalanceFromGetNetBalanceResponse,
  metronomeNetBalanceToCents,
} from '@/utils/metronomeNetBalance';
import {
  formatMetronomeAmount,
  isCustomMetronomeCreditType,
} from '@/utils/metronomeAmount';
import { METRONOME_CATALOG } from '@/config/metronomeCatalog';

interface PurchaseCreditsModalProps {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  onCreditsPurchased?: () => void;
}

export default function PurchaseCreditsModal({
  open,
  setOpen,
  onCreditsPurchased,
}: PurchaseCreditsModalProps) {
  const { t } = useTranslation();
  const {
    settings,
    customer,
    updateCustomer,
    metronomeContract,
    demoMode,
    triggerMetronomeContractRefresh,
  } = useConfigContext();
  const contractCreditTypeName = metronomeContract?.creditTypeName;
  const customCreditTypeName =
    demoMode === 'generation' &&
    (!contractCreditTypeName ||
      isCustomMetronomeCreditType(contractCreditTypeName))
      ? (contractCreditTypeName ?? METRONOME_CATALOG.pricingUnit.name)
      : undefined;
  const formatAmount = (amount: number) =>
    formatMetronomeAmount(
      amount,
      customCreditTypeName,
      settings?.language || 'en',
      settings?.currency || 'usd',
    );
  const formatGenerationCreditPrice = (credits: number) =>
    formatPrice(
      credits * METRONOME_CATALOG.pricingUnit.fiatMinorUnitsPerCustomCredit,
      settings?.language || 'en',
      settings?.currency || 'usd',
    );
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<
    'standard' | 'large' | 'custom'
  >('standard');
  const [customAmount, setCustomAmount] = useState<number | ''>('');
  const [balanceInfo, setBalanceInfo] = useState({
    hasDebt: false,
    debtAmount: 0,
    currentBalance: 0,
  });

  const fetchBalanceData = useCallback(async () => {
    if (!customer?.id) return;
    setIsLoading(true);
    try {
      const netBalanceRes = await fetchClient.post(
        `/api/metronome/customer/${encodeURIComponent(customer.id)}/net-balance`,
        {
          invoice_inclusion_mode: 'FINALIZED_AND_DRAFT',
          ...(metronomeContract?.creditTypeId
            ? { credit_type_id: metronomeContract.creditTypeId }
            : {}),
        },
      );
      const raw = extractBalanceFromGetNetBalanceResponse(netBalanceRes.data);
      const rawCustomBalance = Number(raw);
      const balanceCents = customCreditTypeName
        ? Number.isFinite(rawCustomBalance)
          ? rawCustomBalance
          : 0
        : (metronomeNetBalanceToCents(raw) ?? 0);
      setBalanceInfo({
        hasDebt: false,
        debtAmount: 0,
        currentBalance: balanceCents,
      });
    } catch (error) {
      console.error('Failed to fetch balance data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [customer?.id, customCreditTypeName, metronomeContract?.creditTypeId]);

  useEffect(() => {
    if (open) {
      fetchBalanceData();
      setSelectedOption('standard'); // Reset to default on open
      setCustomAmount(''); // Clear custom amount
      setPurchaseError(null);
    }
  }, [open, fetchBalanceData]);

  const purchaseOptions = useMemo(() => {
    const debtInDollars = balanceInfo.debtAmount / 100;
    // Round up to the nearest dollar for outstanding balance
    const minPurchase = balanceInfo.hasDebt ? Math.ceil(debtInDollars) : 5;
    if (customCreditTypeName) {
      return {
        minPurchase: METRONOME_CATALOG.creditPurchases.minimumCredits,
        standard: {
          amount: METRONOME_CATALOG.creditPurchases.presetCredits[0],
        },
        large: {
          amount: METRONOME_CATALOG.creditPurchases.presetCredits[1],
        },
      };
    }
    return {
      minPurchase,
      standard: { amount: balanceInfo.hasDebt ? minPurchase + 10 : 10 },
      large: { amount: balanceInfo.hasDebt ? minPurchase + 25 : 25 },
    };
  }, [balanceInfo, customCreditTypeName]);

  const finalPurchaseAmount = useMemo(() => {
    if (selectedOption === 'standard') return purchaseOptions.standard.amount;
    if (selectedOption === 'large') return purchaseOptions.large.amount;
    if (
      selectedOption === 'custom' &&
      typeof customAmount === 'number' &&
      customAmount >= purchaseOptions.minPurchase
    ) {
      return customAmount;
    }
    return null;
  }, [selectedOption, customAmount, purchaseOptions]);

  const handlePurchase = async () => {
    if (!finalPurchaseAmount) return;
    setIsProcessing(true);
    setPurchaseError(null);
    try {
      await fetchClient.post(
        `/api/stripe/credit-grant?language=${settings?.language}`,
        {
          customerId: customer?.stripeCustomerId,
          metronomeCustomerId: customer?.id,
          amount: finalPurchaseAmount,
          demoMode,
          creditTypeId: metronomeContract?.creditTypeId,
        },
      );
      await triggerMetronomeContractRefresh();
      updateCustomer({ forceSubscriptionRepoll: new Date() });
      if (onCreditsPurchased) onCreditsPurchased();
      setOpen(false);
    } catch (error: any) {
      setPurchaseError(
        error.response?.data?.error || 'Failed to purchase credits.',
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const InfoBanner = () => (
    <div
      className={`p-4 mb-6 rounded-md border-l-4 ${
        balanceInfo.hasDebt
          ? 'bg-red-50 border-red-500'
          : 'bg-purple-50 border-purple-500'
      }`}
    >
      <div className='flex'>
        <div className='flex-shrink-0'>
          {balanceInfo.hasDebt ? (
            <ExclamationTriangleIcon className='h-5 w-5 text-red-400' />
          ) : (
            <BoltIcon className='h-5 w-5 text-purple-400' />
          )}
        </div>
        <div className='ml-3'>
          <h3
            className={`text-sm font-bold ${
              balanceInfo.hasDebt ? 'text-red-800' : 'text-purple-800'
            }`}
          >
            {balanceInfo.hasDebt
              ? t('modals.purchase_credits.outstanding_balance_title')
              : t('modals.purchase_credits.top_up_credits_title')}
          </h3>
          <p
            className={`mt-1 text-sm ${
              balanceInfo.hasDebt ? 'text-red-700' : 'text-purple-700'
            }`}
          >
            {balanceInfo.hasDebt
              ? t('modals.purchase_credits.outstanding_balance_message')
              : t('modals.purchase_credits.current_balance_message')}{' '}
            <span className='font-extrabold'>
              {formatAmount(
                balanceInfo.hasDebt
                  ? balanceInfo.debtAmount
                  : balanceInfo.currentBalance,
              )}
            </span>
            .
          </p>
        </div>
      </div>
    </div>
  );

  const OptionCard = ({
    id,
    title,
    subtitle,
    amount,
  }: {
    id: 'standard' | 'large' | 'custom';
    title: string;
    subtitle?: string;
    amount?: number;
  }) => {
    const isSelected = selectedOption === id;
    return (
      <div
        onClick={() => setSelectedOption(id)}
        className={`p-4 rounded-lg border cursor-pointer transition-all ${
          isSelected
            ? 'border-purple ring-2 ring-purple-200'
            : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <div className='flex justify-between items-start'>
          <div>
            <p className='font-semibold text-gray-800'>{title}</p>
            {subtitle && (
              <p className='text-sm text-gray-500 mt-1'>{subtitle}</p>
            )}
          </div>
          <div className='flex items-center space-x-2'>
            {amount && (
              <span className='font-bold text-lg text-gray-900'>
                {customCreditTypeName
                  ? formatAmount(amount)
                  : formatPrice(
                      amount * 100,
                      settings?.language || 'en',
                      settings?.currency || 'usd',
                    )}
              </span>
            )}
            <div className='h-6 w-6 flex items-center justify-center'>
              {isSelected && (
                <CheckCircleIcon className='h-6 w-6 text-purple' />
              )}
            </div>
          </div>
        </div>
        {id === 'custom' && isSelected && (
          <div className='mt-4'>
            <div className='relative'>
              {!customCreditTypeName && (
                <span className='absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500'>
                  {new Intl.NumberFormat(settings?.language, {
                    style: 'currency',
                    currency: settings?.currency || 'usd',
                  })
                    .format(0)
                    .replace(/[\d,.]/g, '')}
                </span>
              )}
              <input
                type='number'
                min={purchaseOptions.minPurchase}
                value={customAmount}
                autoFocus
                onChange={(e) => setCustomAmount(Number(e.target.value) || '')}
                placeholder={t('modals.purchase_credits.min_amount', {
                  amount: purchaseOptions.minPurchase,
                })}
                className={`w-full py-2 border-gray-300 rounded-md focus:ring-purple focus:border-purple ${
                  customCreditTypeName ? 'px-3' : 'pl-10'
                }`}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onClose={() => {}} className='relative z-50'>
      <DialogBackdrop
        transition
        className='fixed inset-0 bg-gray-900 bg-opacity-75 transition-opacity data-[closed]:opacity-0'
      />
      <div className='fixed inset-0 z-50 w-screen overflow-y-auto'>
        <div className='flex min-h-full items-center justify-center p-4'>
          <DialogPanel className='relative w-full max-w-md transform overflow-hidden rounded-lg bg-white p-6 text-left shadow-xl transition-all'>
            <div className='absolute right-4 top-4'>
              <button
                onClick={() => setOpen(false)}
                className='text-gray-400 hover:text-gray-600'
              >
                <XMarkIcon className='h-6 w-6' />
              </button>
            </div>
            <DialogTitle as='h3' className='text-lg font-medium text-gray-900'>
              {t('modals.purchase_credits.title')}
            </DialogTitle>
            <div className='mt-4'>
              {isLoading ? (
                <div className='text-center py-12 text-gray-500'>
                  {t('modals.purchase_credits.loading')}
                </div>
              ) : (
                <div className='space-y-4'>
                  <InfoBanner />
                  <OptionCard
                    id='standard'
                    title={
                      balanceInfo.hasDebt
                        ? t('modals.purchase_credits.recommended')
                        : t('modals.purchase_credits.standard')
                    }
                    subtitle={
                      balanceInfo.hasDebt
                        ? t('modals.purchase_credits.clears_outstanding_plus', {
                            amount: customCreditTypeName
                              ? formatAmount(10)
                              : formatPrice(
                                  1000,
                                  settings?.language || 'en',
                                  settings?.currency || 'usd',
                                ),
                          })
                        : customCreditTypeName
                          ? formatGenerationCreditPrice(
                              purchaseOptions.standard.amount,
                            )
                          : ''
                    }
                    amount={purchaseOptions.standard.amount}
                  />
                  <OptionCard
                    id='large'
                    title={
                      balanceInfo.hasDebt
                        ? t('modals.purchase_credits.standard')
                        : t('modals.purchase_credits.large')
                    }
                    subtitle={
                      balanceInfo.hasDebt
                        ? t('modals.purchase_credits.clears_outstanding_plus', {
                            amount: customCreditTypeName
                              ? formatAmount(25)
                              : formatPrice(
                                  2500,
                                  settings?.language || 'en',
                                  settings?.currency || 'usd',
                                ),
                          })
                        : customCreditTypeName
                          ? formatGenerationCreditPrice(
                              purchaseOptions.large.amount,
                            )
                          : ''
                    }
                    amount={purchaseOptions.large.amount}
                  />
                  <OptionCard
                    id='custom'
                    title={t('modals.purchase_credits.custom_amount')}
                  />
                  {purchaseError && (
                    <p className='text-sm text-red-600'>{purchaseError}</p>
                  )}
                  <button
                    onClick={handlePurchase}
                    disabled={isProcessing || !finalPurchaseAmount}
                    className='w-full mt-6 bg-purple text-button-color font-bold py-3 px-4 rounded-lg hover:bg-purple-hover disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors'
                  >
                    {isProcessing
                      ? t('modals.purchase_credits.processing')
                      : finalPurchaseAmount
                        ? t('modals.purchase_credits.purchase_for', {
                            amount: customCreditTypeName
                              ? `${formatGenerationCreditPrice(
                                  finalPurchaseAmount,
                                )} (${formatAmount(finalPurchaseAmount)})`
                              : formatPrice(
                                  finalPurchaseAmount * 100,
                                  settings?.language || 'en',
                                  settings?.currency || 'usd',
                                ),
                          })
                        : t('modals.purchase_credits.select_amount')}
                  </button>
                </div>
              )}
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}
