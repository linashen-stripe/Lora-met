import { formatPrice } from '@/utils/helpers';
import { Card } from '@/components/ui/card';
import { Calendar } from 'lucide-react';
import Skeleton from '@/components/ui/Skeleton';
import { useConfigContext } from '@/contexts/ConfigContext';
import { useTranslation } from 'react-i18next';
import Stripe from 'stripe';

const BillingCard = ({
  previewInvoice,
  isLoading = false,
}: {
  previewInvoice: Stripe.Invoice | { amount_due: number } | null;
  isLoading?: boolean;
}) => {
  const { plan, settings } = useConfigContext();
  const { t } = useTranslation();
  const planName = plan?.displayName;

  return (
    <Card className='bg-white h-full flex flex-col text-gray-900'>
      <div className='p-6 flex flex-row items-center justify-between space-y-0 pb-2'>
        <h3 className='tracking-tight text-base font-semibold'>
          {t('dashboard.cards.next_billing')}
        </h3>
        {isLoading ? (
          <Skeleton className='h-4 w-4 rounded-full' />
        ) : (
          <Calendar className='w-4 h-4 text-purple' />
        )}
      </div>
      <div className='p-6 pt-0 flex flex-col h-full'>
        {isLoading ? (
          <>
            <div className='text-3xl font-bold mb-3'>
              <Skeleton className='h-8 w-32' />
            </div>
            <div className='text-sm text-gray-600 mb-2'>
              <Skeleton className='h-4 w-24' />
            </div>
            <div className='text-xs text-gray-500'>
              <Skeleton className='h-3 w-36' />
            </div>
          </>
        ) : (
          <>
            <div className='text-3xl font-bold mb-3'>
              {formatPrice(
                previewInvoice?.amount_due ?? 0,
                settings?.language,
                (previewInvoice as Stripe.Invoice)?.currency ||
                  settings?.currency,
              )}
            </div>
            <p className='text-sm text-gray-600 mb-2'>{planName}</p>
            <p className='text-xs text-gray-500'>
              {previewInvoice?.amount_due === 0
                ? t('dashboard.cards.no_upcoming_charges')
                : t('dashboard.cards.next_billing_charge')}
            </p>
          </>
        )}
      </div>
    </Card>
  );
};

export default BillingCard;
