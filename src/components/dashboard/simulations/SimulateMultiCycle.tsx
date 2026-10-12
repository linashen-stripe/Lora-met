import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Stripe from 'stripe';
import { Calendar, Play } from 'lucide-react';
import { addDays } from 'date-fns';
import fetchClient from '@/utils/fetchClient';
import { useConfigContext } from '@/contexts/ConfigContext';
import { formatTimestamp } from '@/utils/helpers';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import Spinner from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/badge';
import Button from '@/components/ui/Button';
import Skeleton from '@/components/ui/Skeleton';
import { type UseTestClockResult } from '@/components/hooks/useTestClock';

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

type Status = 'start' | 'advancing' | 'sending' | 'done';

interface SimulationState {
  error: string | null;
  isRunning: boolean;
  progress: number;
  status: null | Status;
}

/**
 * Generates random usage data for each metered item for each day between start and end date.
 * @param meteredItems Array of items to generate usage for.
 * @param startDate Date object representing the start date (inclusive).
 * @param endDate Date object representing the end date (inclusive).
 * @param maxTimestamp The maximum timestamp to generate usage for.
 * @returns Array of usage records: [{ itemId, date, usage }]
 */
const generateUsageForTimeFrame = (
  meteredItems: any[],
  startDate: Date,
  endDate: Date,
  maxTimestamp: number,
) => {
  const usageRecords: Array<{
    eventName: string;
    timestamp: string;
    amount: number;
    meter_segment_conditions: any[];
  }> = [];

  // Start with the start date
  const current = new Date(startDate);

  /**
   * Generates some usage for each metered item at some point during the current day.
   * Could be improved to generate multiple events per item per day, but our usage dashboard
   * show accumulated usage per day (not per hour), so it wouldn't necessarily make the
   * visualization more interesting.
   */
  while (current <= endDate) {
    meteredItems.forEach((item) => {
      // Generate usage targeting ~$20 total cost
      let usage = 0;

      if (item.meter_event_name.includes('image')) {
        // Images: ~2/month (~$10 cost at $5 per standard image)
        if (Math.random() < 0.07) {
          usage = 1;
        }
      } else {
        // Check if this is a Custom API model (high cost)
        const isCustomAPI = item.meter_segment_conditions?.some(
          (condition: any) =>
            condition.dimension === 'model' &&
            condition.value?.toLowerCase().includes('custom'),
        );

        if (isCustomAPI) {
          // Custom API: Much lower usage due to high cost ($15-75 per million)
          // Generate 200-800 tokens per day (average 500/day = 15K/month = ~$1-5)
          if (Math.random() < 0.3) {
            // Only 30% of days
            usage = Math.floor(Math.random() * 600) + 200;
          }
        } else {
          // Standard AI models: Normal usage ($0.50-37.50 per million)
          // Generate 5K-15K tokens per day (average 10K/day = 300K/month)
          usage = Math.floor(Math.random() * 10000) + 5000;
        }
      }

      // Pick a random timestamp within the current day
      const dayStart = new Date(current);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(current);
      dayEnd.setHours(23, 59, 59, 999);

      // Clamp the random timestamp to the max timestamp
      const randomTimestamp = Math.min(
        maxTimestamp,
        dayStart.getTime() +
          Math.floor(
            Math.random() * (dayEnd.getTime() - dayStart.getTime() + 1),
          ),
      );

      // Convert the random timestamp to ISO string for API request
      const timestamp = new Date(randomTimestamp).toISOString();

      // Only add usage if it's greater than 0
      if (usage > 0) {
        usageRecords.push({
          eventName: item.meter_event_name,
          timestamp: timestamp,
          amount: usage,
          meter_segment_conditions: item?.meter_segment_conditions ?? [],
        });
      }
    });

    // Move to next day
    current.setDate(current.getDate() + 1);
  }

  return usageRecords;
};

const simulateCycle = async (
  customerId: string,
  testClock: UseTestClockResult,
  billingCadence: Stripe.V2.Billing.Cadence,
  meteredItems: any,
  setStatus: (status: null | Status) => void,
  setProgress: (progress: number) => void,
): Promise<boolean> => {
  if (testClock.isLoading || testClock.isAdvancing || !testClock.timeInMs) {
    console.error('Test clock is not ready, could not simulate cycle');
    return false;
  }

  setStatus('start');

  // TODO: consider if we should advance to the next billing day or the same day next month
  // i.e. if the billing day is the 1st, but its the 11th, should we advance to the 11th of next month?
  // current code will advance to the next billing day
  const billingDay = billingCadence.billing_cycle.month?.day_of_month ?? 1;
  const currentDate = new Date(testClock.timeInMs);
  const currentDay = currentDate.getDate();

  // This is how many days until the cycle completes
  let daysToAdvance = 0;

  if (currentDay < billingDay) {
    daysToAdvance = billingDay - currentDay;
  } else {
    // TODO: improve this for cases where months have different number of days
    daysToAdvance = billingDay - currentDay + 30;
  }

  // Calculate the next timestamp in ms by advancing the current timestamp by the number of days to advance
  const nextTimestamp = testClock.timeInMs + daysToAdvance * ONE_DAY_IN_MS;

  // TODO: how to handle users on the free plan that run out of credits?
  const usageRecords = generateUsageForTimeFrame(
    meteredItems,
    currentDate,
    addDays(currentDate, daysToAdvance),
    nextTimestamp,
  );

  setStatus('advancing');

  // Advance the test clock to the next timestamp
  await testClock.updateTime(nextTimestamp);

  // We must wait for the test clock to finish advancing before sending usage,
  // otherwise the usage will be invalid (if timestamp is 5min in the future of test clock) and discarded
  await testClock.waitForReady();

  setStatus('sending');

  try {
    // Split the data array into chunks to avoid rate limiting
    const chunkSize = 20;
    const delay = 1000;
    const chunks: object[][] = [];
    for (let i = 0; i < usageRecords.length; i += chunkSize) {
      chunks.push(usageRecords.slice(i, i + chunkSize));
    }

    // Send the chunks with delay to avoid rate limiting
    let i = 0;
    while (i < chunks.length) {
      const chunk = chunks[i];
      await fetchClient.post('/api/stripe/meter/send-bulk-usage', {
        customerId: customerId,
        data: chunk,
      });

      console.log(`Sent chunk ${i + 1} of ${chunks.length}`);
      // Delay before sending the next chunk to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, delay));
      setProgress(Math.floor((i / chunks.length) * 100));
      i++;
    }
  } catch (error) {
    console.error(error);
    return false;
  }

  setStatus('done');
  return true;
};

const SimulateMultiCycle = ({
  testClock,
  meteredItems,
  billingCadence,
}: {
  testClock: UseTestClockResult;
  meteredItems: any;
  billingCadence: Stripe.V2.Billing.Cadence;
}) => {
  const { t } = useTranslation();
  const { customer, settings } = useConfigContext();
  const billingDay = billingCadence.billing_cycle.month?.day_of_month ?? 1;

  const [cycleState, setCycleState] = useState<SimulationState>({
    error: '',
    isRunning: false,
    progress: 0,
    status: null,
  });

  const startSimulation = async () => {
    if (!customer?.id) {
      console.error('Customer ID is required to start simulation');
      return;
    }

    // Set the simulation state to running
    setCycleState({
      isRunning: true,
      error: null,
      progress: 0,
      status: null,
    });

    // Simulate the cycle
    const result = await simulateCycle(
      customer.id,
      testClock,
      billingCadence,
      meteredItems,
      (status) => {
        setCycleState((prev) => ({ ...prev, status }));
      },
      (progress) => {
        setCycleState((prev) => ({ ...prev, progress }));
      },
    );

    if (!result) {
      setCycleState({
        isRunning: false,
        error: 'Failed to simulate the cycle.',
        progress: 0,
        status: null,
      });
      return;
    }

    // Set the simulation state to stopped
    setCycleState({
      isRunning: false,
      error: null,
      progress: 0,
      status: null,
    });
  };

  const getButtonText = () => {
    if (cycleState.status === 'start') {
      return 'Starting simulation';
    }

    if (cycleState.status === 'advancing') {
      return 'Advancing test clock';
    }

    if (cycleState.status === 'sending') {
      return `Sending usage: ${cycleState.progress}%`;
    }

    if (cycleState.status === 'done') {
      return 'Simulation complete';
    }

    return t('dashboard.simulations.cycle_button_start');
  };

  return (
    <div className='space-y-4'>
      <div className='flex items-center space-x-2'>
        <div className='bg-primary/20 text-primary px-3 py-1 rounded-full text-sm font-medium'>
          {t('dashboard.simulations.scenario_3')}
        </div>
        <h2 className='text-xl font-semibold'>
          {t('dashboard.simulations.cycle_title')}
        </h2>
      </div>

      <Card className='bg-white'>
        <CardHeader>
          <div className='flex items-center justify-between'>
            <div className='flex items-center space-x-2'>
              <Calendar className='h-5 w-5 text-purple' />
              <CardTitle>
                {t('dashboard.simulations.cycle_card_title')}
              </CardTitle>
            </div>
            {cycleState.isRunning ? (
              <Badge variant='default'>
                {t('dashboard.simulations.cycle_status_running')}
              </Badge>
            ) : (
              <Badge className='bg-primary/10 text-primary border-primary/30 border hover:bg-primary/20'>
                {t('dashboard.simulations.cycle_status_stopped')}
              </Badge>
            )}
          </div>
          <CardDescription>
            <p>{t('dashboard.simulations.cycle_description_line1')}</p>
            <p>{t('dashboard.simulations.cycle_description_line2')}</p>
            <p>
              {t('dashboard.simulations.cycle_description_line3', {
                day: billingDay,
              })}
            </p>
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='bg-background p-4 rounded-lg'>
            <div className='grid grid-cols-1 gap-4 text-sm'>
              <div>
                <span className='font-medium'>
                  {t('dashboard.simulations.cycle_current_date')}
                </span>
                <div>
                  {testClock.timeInMs ? (
                    formatTimestamp(
                      Math.floor(testClock.timeInMs / 1000),
                      'short',
                      settings?.language || 'en',
                    )
                  ) : (
                    <Skeleton className='w-24 h-4' />
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className='flex space-x-2'>
            <Button
              className='bg-purple hover:bg-purple-hover'
              onClick={startSimulation}
              disabled={
                cycleState.isRunning ||
                testClock.isLoading ||
                testClock.isAdvancing
              }
              text={getButtonText()}
              icon={
                cycleState.isRunning ? (
                  <Spinner />
                ) : (
                  <Play className='h-4 w-4 mr-2' />
                )
              }
            />
          </div>
          {cycleState.error && (
            <div className='text-red-500'>{cycleState.error}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SimulateMultiCycle;
