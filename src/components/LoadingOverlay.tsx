import { useTranslation } from 'react-i18next';
import { Spinner } from './ui';

export default function LoadingOverlay() {
  const { t } = useTranslation();

  return (
    <div className='flex items-center justify-center min-h-screen bg-background'>
      <div className='flex flex-col items-center'>
        <Spinner />
        <p className='mt-4 text-lg font-semibold text-text-color'>
          {t('loading')}
        </p>
      </div>
    </div>
  );
}
