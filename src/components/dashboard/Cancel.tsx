import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import CancelModal from '@/components/dashboard/CancelModal';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

const Cancel = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card className='mt-4 bg-white text-gray-900'>
        <CardHeader>
          <CardTitle>{t('settings.cancellation.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='flex items-center justify-between'>
            <span>{t('settings.cancellation.cancelPlan')}</span>
            <button
              onClick={() => setOpen(true)}
              className='bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition duration-300'
            >
              {t('settings.cancellation.cancel')}
            </button>
          </div>
        </CardContent>
      </Card>

      <CancelModal open={open} setOpen={setOpen} />
    </>
  );
};

export default Cancel;
