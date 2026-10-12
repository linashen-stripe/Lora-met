import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import CancelModal from './CancelModal';
import Stripe from 'stripe';

interface CancelProps {
  subscription: Stripe.Subscription;
  type: string;
}

const Cancel = ({ subscription, type }: CancelProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className='bg-white rounded-lg shadow p-6'>
        <h2 className='text-xl font-semibold mb-4'>
          {t('settings.cancellation.title')}
        </h2>
        <div className='flex items-center justify-between'>
          <span>{t('settings.cancellation.cancelPlan')}</span>
          <button
            onClick={() => setOpen(true)}
            className='bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition duration-300'
          >
            {t('settings.cancellation.cancel')}
          </button>
        </div>
      </div>

      <CancelModal
        subscription={subscription}
        open={open}
        setOpen={setOpen}
        type={type}
      />
    </>
  );
};

export default Cancel;
