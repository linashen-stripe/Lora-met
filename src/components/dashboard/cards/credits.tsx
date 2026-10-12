import { formatPrice } from '@/utils/helpers';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Zap } from 'lucide-react';
import { useConfigContext } from '@/contexts/ConfigContext';
import { useTranslation } from 'react-i18next';
import { MetronomeAutoTopUp } from '@/utils/types';
import useAnimatedNumber from '@/components/hooks/useAnimatedNumber';
import { formatMetronomeAmount } from '@/utils/metronomeAmount';

const CreditsCard = ({
  totalAvailable,
  totalAmount,
  creditBarVariant = 'remaining',
  /** Minor units are in this currency (e.g. from GET /api/stripe/credit-balance/:id). */
  balanceCurrency,
  creditTypeName,
  autoTopUp,
  animationFrom,
}: {
  totalAvailable: number;
  totalAmount: number;
  /** `used`: thick bar = consumed portion. `remaining`: Radix progress = % left. */
  creditBarVariant?: 'remaining' | 'used';
  balanceCurrency?: string;
  creditTypeName?: string;
  autoTopUp?: MetronomeAutoTopUp;
  /** Prior balance used for a one-time count-up after upgrade hydration. */
  animationFrom?: number;
}) => {
  const { settings } = useConfigContext();
  const { t } = useTranslation();
  const currency = balanceCurrency ?? settings?.currency;
  const displayedAvailable = useAnimatedNumber(
    totalAvailable,
    700,
    animationFrom ?? totalAvailable,
  );
  const displayedTotal = useAnimatedNumber(totalAmount);
  const percentageRemaining =
    displayedTotal === 0 ? 0 : (displayedAvailable / displayedTotal) * 100;
  const usedPct =
    displayedTotal === 0
      ? 0
      : Math.min(
          100,
          Math.max(
            0,
            ((displayedTotal - displayedAvailable) / displayedTotal) * 100,
          ),
        );

  const fmt = (amount: number) =>
    creditTypeName
      ? formatMetronomeAmount(
          amount,
          creditTypeName,
          settings?.language,
          currency,
        )
      : formatPrice(amount, settings?.language, currency);

  const heading = creditTypeName ?? t('dashboard.ai_credits');
  const barAria = t('dashboard.ai_credits');

  return (
    <>
      <Card className='rounded-lg border shadow-sm bg-white h-full flex flex-col text-gray-900'>
        <div className='p-6 flex flex-row items-center justify-between space-y-0 pb-2'>
          <h3 className='tracking-tight text-base font-semibold'>
            {heading}
          </h3>
          <Zap
            className='w-4 h-4 text-purple'
            aria-hidden
          />
        </div>

        <div className='p-6 pt-0'>
          <div className='text-3xl font-bold mb-3 tabular-nums'>
            {fmt(displayedAvailable)}
          </div>
          {creditBarVariant === 'used' ? (
            <div
              className='mb-3 flex h-14 w-full overflow-hidden rounded-2xl bg-gray-100 ring-1 ring-black/5'
              role='img'
              aria-label={barAria}
            >
              <div
                className='h-full min-w-0 bg-violet-500 transition-[width]'
                style={{ width: `${usedPct}%` }}
              />
            </div>
          ) : (
            <Progress
              className='mb-2 bg-gray-200 [&>div]:bg-purple'
              value={percentageRemaining}
              aria-label={barAria}
            />
          )}
          <p className='text-sm text-gray-600 mb-4'>
            {creditBarVariant === 'used'
              ? t('dashboard.spend_meter_caption', {
                  available: fmt(displayedAvailable),
                  credits: fmt(displayedTotal),
                })
              : t('dashboard.credits_of_total', {
                  available: fmt(displayedAvailable),
                  total: fmt(displayedTotal),
                })}
          </p>
          {autoTopUp && (
            <div className='flex items-center gap-1.5 text-xs text-green-700 bg-green-50 rounded-md px-2.5 py-1.5'>
              <span className='inline-block w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0' />
              <span>
                {t('dashboard.auto_top_up_status', { to: fmt(autoTopUp.rechargeToAmountCents), threshold: fmt(autoTopUp.thresholdCents) })}
              </span>
            </div>
          )}
        </div>
      </Card>
    </>
  );
};

export default CreditsCard;
