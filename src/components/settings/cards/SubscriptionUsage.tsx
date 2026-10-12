import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AdjustmentsHorizontalIcon } from '@heroicons/react/20/solid';
import { useConfigContext } from '@/contexts/ConfigContext';
import fetchClient from '@/utils/fetchClient';
import SimulateUsageModal from './SimulateUsageModal';

interface UsageProps {
  subscription: any | null;
  plan: string | null;
}

interface Meter {
  id: string;
  event_name: string;
  display_name: string;
  aggregated_value: number;
}

interface MeterStatus {
  id: string;
  amount: number;
}

const SubscriptionUsage = ({ subscription, plan }: UsageProps) => {
  const { t } = useTranslation();
  const { settings, customer } = useConfigContext();
  const [simulationOpen, setSimulationOpen] = useState(false);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [meterStatuses, setMeterStatuses] = useState<MeterStatus[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchMeters = async () => {
      try {
        const { data } = await fetchClient.get(`/api/stripe/meter`);
        setMeters(data.meters);
      } catch (error) {
        console.error('Error fetching meters:', error);
      }
    };

    fetchMeters();
  }, []);

  useEffect(() => {
    if (
      !meters.length ||
      !subscription ||
      !subscription.items ||
      !customer?.stripeCustomerId ||
      plan?.includes('Plus') ||
      plan?.includes('Free')
    ) {
      return;
    }
    const fetchMeterStatuses = async () => {
      setLoading(true);
      try {
        const currentPeriodStart =
          subscription.items.data[0].current_period_start;
        const currentPeriodEnd = subscription.items.data[0].current_period_end;
        const statuses = await Promise.all(
          meters.map(async (meter) => {
            const { data } = await fetchClient.post(
              `/api/stripe/meter/${meter.id}`,
              {
                customerId: customer.stripeCustomerId,
                startRange: currentPeriodStart,
                endRange: currentPeriodEnd,
              },
            );

            return {
              id: meter.id,
              amount: data.meters.reduce(
                (prev: number, curr: Meter) => prev + curr.aggregated_value,
                0,
              ),
            };
          }),
        );
        setMeterStatuses(statuses);
      } catch (error) {
        console.error('Error fetching meter statuses:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMeterStatuses();
  }, [subscription, customer, meters, plan]);

  if (
    !subscription ||
    !subscription.items ||
    plan?.includes('Plus') ||
    plan?.includes('Free')
  ) {
    return null;
  }

  return (
    <>
      <div className='bg-white rounded-lg shadow p-6 relative'>
        {/* Slider adjustment icon */}
        <div className='absolute top-5 right-5'>
          <AdjustmentsHorizontalIcon
            onClick={() => setSimulationOpen(true)}
            className='h-5 w-5 text-gray-400 hover:text-gray-600 cursor-pointer'
          />
        </div>

        <div className='flex justify-between items-center mb-4'>
          <h2 className='text-xl font-semibold'>
            {t('settings.meter.current')}
          </h2>
        </div>

        {loading ? (
          <p>{t('loading')}</p>
        ) : (
          meters.map((meter: Meter) => {
            const status = meterStatuses.find((m) => m.id === meter.id);
            return (
              <p key={meter.id} className='text-gray-600 mt-2'>
                {meter.display_name.includes('1.1') && plan?.includes('Team')
                  ? `${t('code.code_analyzer')} ${t('subscription_team.usage')}`
                  : t(`meters.${meter.id}.name`, meter.display_name)}{' '}
                -{' '}
                {status
                  ? `${new Intl.NumberFormat(settings?.language || 'en', {
                      style: 'decimal',
                    }).format(status.amount)} ${t('settings.meters.used')}`
                  : t('loading')}
              </p>
            );
          })
        )}
      </div>

      <SimulateUsageModal
        open={simulationOpen}
        setOpen={setSimulationOpen}
        meters={meters}
      />
    </>
  );
};

export default SubscriptionUsage;
