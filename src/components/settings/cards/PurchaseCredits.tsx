import React, { useState } from 'react';
import PurchaseCreditsModal from './PurchaseCreditsModal';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import Stripe from 'stripe';

interface PurchaseCreditsCardProps {
  subscription: Stripe.Subscription | null;
}

const PurchaseCreditsCard = ({ subscription }: PurchaseCreditsCardProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState<boolean>(false);

  return (
    <>
      {subscription && (
        <div className='bg-white rounded-lg shadow p-6'>
          <h2 className='text-2xl font-semibold text-gray-800 mb-3'>
            {t('settings.credits.purchase')}
          </h2>
          <div className='flex items-center space-x-2'>
            <span className='bg-purple-100 text-purple-800 text-xs font-semibold px-2.5 py-0.5 rounded-full'>
              {t('settings.credits.new')}
            </span>
            <p className='text-gray-600'>
              <Link
                className='underline'
                href='#'
                onClick={() => setOpen(true)}
              >
                {t('settings.credits.buy')}
              </Link>{' '}
              {t('settings.credits.provide')}
            </p>
          </div>
        </div>
      )}

      <PurchaseCreditsModal open={open} setOpen={setOpen} />
    </>
  );
};

export default PurchaseCreditsCard;
