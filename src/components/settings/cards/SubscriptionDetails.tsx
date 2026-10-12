import { useConfigContext } from '@/contexts/ConfigContext';
import { useTranslation } from 'react-i18next';

interface SubscriptionDetailsProps {
  subscription: any;
  pricing_plan?: any;
}

const SubscriptionDetails = ({
  subscription,
  pricing_plan,
}: SubscriptionDetailsProps) => {
  const { t } = useTranslation();
  const { customer } = useConfigContext();

  const getStatusBadge = () => {
    if (!subscription) return null;

    const status = subscription.servicing_status;

    switch (status) {
      case 'active':
        return (
          <span className='bg-green-100 text-green-800 h-fit text-xs font-semibold mr-2 px-2.5 py-0.5 rounded'>
            {t('settings.subscription.active')}
          </span>
        );
      case 'canceled':
        return (
          <span className='bg-red-100 text-red-800 h-fit text-xs font-semibold mr-2 px-2.5 py-0.5 rounded'>
            {t('settings.subscription.canceled')}
          </span>
        );
      case 'paused':
        return (
          <span className='bg-yellow-100 text-yellow-800 h-fit text-xs font-semibold mr-2 px-2.5 py-0.5 rounded'>
            {t('settings.subscription.paused')}
          </span>
        );
      default:
        return (
          <span className='bg-gray-100 text-gray-800 h-fit text-xs font-semibold mr-2 px-2.5 py-0.5 rounded'>
            {status}
          </span>
        );
    }
  };

  return (
    <div className='bg-white rounded-lg shadow p-6'>
      <div className='flex flex-row justify-between'>
        <div className='flex flex-col'>
          <h2 className='text-xl font-semibold'>
            {pricing_plan
              ? pricing_plan.display_name
              : subscription.plan.product.name}
          </h2>
        </div>
        {getStatusBadge()}
      </div>
      {customer && (
        <div className='mb-2'>
          <p className='text-gray-600'>{customer.email}</p>
          <p className='text-sm text-gray-500'>{customer.name}</p>
        </div>
      )}
      <div className='flex text-sm'>
        <span className='text-gray-600 pr-2'>
          {t('settings.subscription.billing_period')}:
        </span>
        <span className='font-medium'>
          {pricing_plan ? (
            'Monthly'
          ) : (
            <p>{t(`settings.subscription.${subscription.plan.interval}ly`)}</p>
          )}
        </span>
      </div>

      <div className='space-y-3 mb-4'></div>
      <div className='bg-purple-50 p-3 rounded-md text-sm'>
        <p className='text-purple-700'>
          {t('settings.subscription.usage_billing_note')}
        </p>
      </div>
    </div>
  );
};

export default SubscriptionDetails;
