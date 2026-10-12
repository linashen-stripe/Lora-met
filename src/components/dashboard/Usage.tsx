import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { subDays, addDays, subMonths, differenceInDays, sub } from 'date-fns';
import {
  ArrowUp,
  ArrowDown,
  ChartColumnIncreasing,
  Image,
  Sparkles,
  Layers,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import UsageChartDataProvider from '@/components/dashboard/UsageChartDataProvider';
import DayTrendChart from '@/components/dashboard/DayTrendChart';
import AggregatedUsageList from '@/components/dashboard/AggregatedUsageList';
import fetchClient from '@/utils/fetchClient';
import { useConfigContext } from '@/contexts/ConfigContext';
import { DateRange } from '@/components/dashboard/DateRangePicker';
import useTestClock from '@/components/hooks/useTestClock';
import Stripe from 'stripe';

type MeterUsageRowLike = {
  meter?: string | null;
  meter_id?: string;
  value?: number;
  bucket_value?: number;
  dimensions?: Record<string, string> | null;
  [key: string]: unknown;
};

type UsageProps = {
  dateRange: DateRange;
  meteredItems: any[];
  testClockTime: number;
  billingCadence: Stripe.V2.Billing.Cadence;
};

/**
 * Maps event name to meter IDs which are used by the analytics API
 */
const getMeterTypes = (meteredItems: any[]): Record<string, string> => {
  return meteredItems.reduce((acc, item) => {
    if (item.meter_event_name === 'ai_model_usage') {
      acc.model = item.meter;
    }
    if (item.meter_event_name === 'image_generation') {
      acc.image_generation = item.meter;
    }
    if (item.meter_event_name === 'image_enhancement') {
      acc.image_enhancement = item.meter;
    }
    if (item.meter_event_name === 'batch_image_generation') {
      acc.batch_image_generation = item.meter;
    }

    return acc;
  }, {});
};

// Generates a dictionary of metered item ID to item data
const getMeteredItemLookupDictionary = (
  meteredItems: any[],
): Record<string, any> => {
  return meteredItems.reduce((acc, item) => {
    const dimensionString = item.meter_segment_conditions
      ? item.meter_segment_conditions.map((c: any) => c.value).join('_')
      : '';

    const lookupKey =
      dimensionString.length > 0
        ? `${item.meter}-${dimensionString}`
        : item.meter;

    acc[lookupKey] = item;
    return acc;
  }, {});
};

const unixAlignedTime = (date: Date) => {
  // Align the date to the start of the day in UTC
  // Use getUTC* methods to correctly handle UTC dates regardless of local timezone
  const startOfDay = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );

  // Return the timestamp in seconds
  return Math.floor(startOfDay.getTime() / 1000);
};

/**
 * Get the start and end time for the usage chart
 */
const getStartAndEndTime = (
  dateRange: DateRange,
  testClockTime: number,
  billingCadence: Stripe.V2.Billing.Cadence,
) => {
  // Use test clock time if available, otherwise use current time
  const now = testClockTime ? new Date(testClockTime * 1000) : new Date();

  // Get tomorrow's timestamp in UTC
  const tomorrow = addDays(now, 1);
  let endDate = tomorrow;

  // Get the start date based on the date range
  let startDate;
  switch (dateRange) {
    case 'current-billing':
      if (billingCadence.next_billing_date) {
        endDate = new Date(billingCadence.next_billing_date);
        startDate = subMonths(endDate, 1);
        break;
      }
    // if cadence is not active, will fallback to next case
    case 'last-30-days':
      startDate = subDays(now, 29);
      break;
    case 'last-7-days':
      startDate = subDays(now, 6);
      break;
    default:
      throw new Error(`Invalid date range: ${dateRange}`);
  }

  // Align the start time to the start of the day in UTC
  const startTime = unixAlignedTime(startDate);
  const endTime = unixAlignedTime(endDate);

  // Calculate the number of days passed between the start time and the end time
  const daysPassed = differenceInDays(endDate, startDate);

  return {
    startTime,
    endTime,
    daysPassed,
  };
};

/**
 * Get the unique meters and dimensions from the metered items
 */
const getUniqueMetersAndDimensions = (
  meteredItems: any[],
): Record<string, string[] | null> => {
  return meteredItems.reduce((acc, item) => {
    acc[item.meter] = item.meter_segment_conditions
      ? item.meter_segment_conditions.map((c: any) => c.dimension)
      : null;
    return acc;
  }, {});
};

/**
 * Get the aggregated usage for the given metered items
 * @param meteredItems - The metered items
 * @param customerId - The customer ID
 * @param startTime - The start time
 * @param endTime - The end time
 * @returns The aggregated usage
 */
const useAggregatedUsage = (
  meteredItems: any[],
  customerId: string | null,
  startTime: number,
  endTime: number,
) => {
  // Compute meter params and stable key
  const { meterParams, metersKey } = useMemo(() => {
    const uniqueMetersAndDimensions =
      getUniqueMetersAndDimensions(meteredItems);

    const params = Object.entries(uniqueMetersAndDimensions)
      .filter(([meter]) => meter && meter !== 'null' && meter !== 'undefined') // Only include valid meter IDs
      .map(([meter, dimensions]) => ({
        meter_id: meter,
        dimension_group_by_keys: dimensions,
      }));

    const key = params
      .map((p) => `${p.meter_id}:${p.dimension_group_by_keys?.join(',') ?? ''}`)
      .sort()
      .join('|');

    return { meterParams: params, metersKey: key };
  }, [meteredItems]);

  const {
    data: aggregatedUsage = [],
    error,
    isLoading,
  } = useQuery({
    queryKey: ['aggregatedUsage', customerId, metersKey, startTime, endTime],
    queryFn: async () => {
      const response = await fetchClient.post('/api/stripe/meter/usage', {
        customer: customerId,
        start_time: startTime,
        end_time: endTime,
        meters: meterParams,
      });
      const rows = response.data?.data ?? response.data?.rows?.data ?? [];
      return rows.map((item: MeterUsageRowLike) => {
        const meterId = item.meter ?? item.meter_id;
        const meter = meteredItems.find(
          (m) =>
            m.meter === meterId &&
            m.meter_segment_conditions?.every(
              (c: any) => item.dimensions?.[c.dimension] === c.value,
            ),
        );
        return {
          ...item,
          display_name: meter?.display_name,
        };
      });
    },
    enabled: Boolean(customerId && meterParams.length > 0),
  });

  return { aggregatedUsage, error, isLoading };
};

/**
 * Get the usage for the dashboard cards
 * @param customerId - The customer ID
 * @param startTime - The start time
 * @param endTime - The end time
 * @returns The usage for the dashboard cards
 */
const useDashboardCardsUsage = (
  meterTypes: Record<string, string>,
  customerId: string | null,
  startTime: number,
  endTime: number,
) => {
  // Compute meter params and stable key
  const { meterParams, metersKey } = useMemo(() => {
    const params = [
      { meter_id: meterTypes.model, dimension_group_by_keys: ['type'] },
      { meter_id: meterTypes.image_generation },
      { meter_id: meterTypes.image_enhancement },
      { meter_id: meterTypes.batch_image_generation },
    ].filter((m) => m.meter_id); // Filter out undefined meter IDs

    const key = params
      .map((p) => p.meter_id)
      .sort()
      .join('|');

    return { meterParams: params, metersKey: key };
  }, [meterTypes]);

  const {
    data: usage = {},
    isLoading,
    error,
  } = useQuery({
    queryKey: [
      'dashboardCardsUsage',
      customerId,
      metersKey,
      startTime,
      endTime,
    ],
    queryFn: async () => {
      const response = await fetchClient.post('/api/stripe/meter/usage', {
        customer: customerId,
        start_time: startTime,
        end_time: endTime,
        meters: meterParams,
      });
      const rows = response.data?.data ?? response.data?.rows?.data ?? [];
      return rows.reduce(
        (acc: Record<string, number>, item: MeterUsageRowLike) => {
          const meterId = item.meter ?? item.meter_id;
          const val = item.value ?? item.bucket_value ?? 0;
          if (
            meterId === meterTypes.model &&
            item.dimensions?.type === 'input'
          ) {
            acc.model_input_tokens = val;
          }
          if (
            meterId === meterTypes.model &&
            item.dimensions?.type === 'output'
          ) {
            acc.model_output_tokens = val;
          }
          if (meterId === meterTypes.image_generation) {
            acc.images_generated = val;
          }
          if (meterId === meterTypes.image_enhancement) {
            acc.images_enhanced = val;
          }
          if (meterId === meterTypes.batch_image_generation) {
            acc.batch_images_processed = val;
          }
          return acc;
        },
        {} as Record<string, number>,
      );
    },
    enabled: Boolean(customerId && meterParams.length > 0),
  });

  return { isLoaded: !isLoading, error, ...usage };
};

type ChartTab =
  | 'model'
  | 'image-generation'
  | 'image-enhancement'
  | 'image-batch-processing';

function Usage({
  dateRange,
  testClockTime,
  meteredItems,
  billingCadence,
}: {
  dateRange: DateRange;
  testClockTime: number;
  meteredItems: any[];
  billingCadence: Stripe.V2.Billing.Cadence;
}) {
  const { customer } = useConfigContext();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<ChartTab>('model');

  const customerId = customer?.id ?? null;

  const { startTime, endTime, daysPassed } = getStartAndEndTime(
    dateRange,
    testClockTime,
    billingCadence,
  );

  const { aggregatedUsage } = useAggregatedUsage(
    meteredItems,
    customerId,
    startTime,
    endTime,
  );

  const meterTypes = useMemo(() => getMeterTypes(meteredItems), [meteredItems]);
  const meteredItemLookupDictionary = useMemo(
    () => getMeteredItemLookupDictionary(meteredItems),
    [meteredItems],
  );

  const {
    isLoaded: isLoadedDashboardCardsUsage,
    model_input_tokens,
    model_output_tokens,
    images_generated,
    images_enhanced,
    batch_images_processed,
  } = useDashboardCardsUsage(meterTypes, customerId, startTime, endTime);

  return (
    <>
      <div className='grid md:grid-cols-5 gap-6'>
        <Card className='bg-white flex flex-col'>
          <CardHeader className='flex flex-row justify-between gap-2 pb-2 min-h-[60px]'>
            <span className='tracking-tight text-sm font-medium leading-tight flex-1'>
              {t('dashboard.usage.model_input_tokens')}
            </span>
            <ArrowUp className='w-4 h-4 text-green-500 flex-shrink-0 mt-0.5' />
          </CardHeader>
          <CardContent className='flex-1 flex flex-col justify-end'>
            <p className='text-2xl font-bold'>
              {isLoadedDashboardCardsUsage
                ? new Intl.NumberFormat('en-US', {}).format(
                    model_input_tokens ?? 0,
                  )
                : '-'}
            </p>

            <p className='text-xs text-muted-foreground'>
              {t('dashboard.usage.across_all_models')}
            </p>
          </CardContent>
        </Card>
        <Card className='bg-white flex flex-col'>
          <CardHeader className='flex flex-row justify-between gap-2 pb-2 min-h-[60px]'>
            <span className='tracking-tight text-sm font-medium leading-tight flex-1'>
              {t('dashboard.usage.model_output_tokens')}
            </span>
            <ArrowDown className='w-4 h-4 text-red-500 flex-shrink-0 mt-0.5' />
          </CardHeader>
          <CardContent className='flex-1 flex flex-col justify-end'>
            <p className='text-2xl font-bold'>
              {isLoadedDashboardCardsUsage
                ? new Intl.NumberFormat('en-US', {}).format(
                    model_output_tokens ?? 0,
                  )
                : '-'}
            </p>
            <p className='text-xs text-muted-foreground'>
              {t('dashboard.usage.generated_responses')}
            </p>
          </CardContent>
        </Card>
        <Card className='bg-white flex flex-col'>
          <CardHeader className='flex flex-row justify-between gap-2 pb-2 min-h-[60px]'>
            <span className='tracking-tight text-sm font-medium leading-tight flex-1'>
              {t('dashboard.usage.images_generated')}
            </span>
            <Image className='w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5' />
          </CardHeader>
          <CardContent className='flex-1 flex flex-col justify-end'>
            <p className='text-2xl font-bold'>
              {isLoadedDashboardCardsUsage
                ? new Intl.NumberFormat('en-US', {}).format(
                    images_generated ?? 0,
                  )
                : '-'}
            </p>
            <p className='text-xs text-muted-foreground'>
              {t('dashboard.usage.all_resolutions')}
            </p>
          </CardContent>
        </Card>
        <Card className='bg-white flex flex-col'>
          <CardHeader className='flex flex-row justify-between gap-2 pb-2 min-h-[60px]'>
            <span className='tracking-tight text-sm font-medium leading-tight flex-1'>
              {t('dashboard.usage.images_enhanced')}
            </span>
            <Sparkles className='w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5' />
          </CardHeader>
          <CardContent className='flex-1 flex flex-col justify-end'>
            <p className='text-2xl font-bold'>
              {isLoadedDashboardCardsUsage
                ? new Intl.NumberFormat('en-US', {}).format(
                    images_enhanced ?? 0,
                  )
                : '-'}
            </p>
            <p className='text-xs text-muted-foreground'>
              {t('dashboard.usage.enhancement_operations')}
            </p>
          </CardContent>
        </Card>
        <Card className='bg-white flex flex-col'>
          <CardHeader className='flex flex-row justify-between gap-2 pb-2 min-h-[60px]'>
            <span className='tracking-tight text-sm font-medium leading-tight flex-1'>
              {t('dashboard.usage.batch_images_processed')}
            </span>
            <Layers className='w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5' />
          </CardHeader>
          <CardContent className='flex-1 flex flex-col justify-end'>
            <p className='text-2xl font-bold'>
              {isLoadedDashboardCardsUsage
                ? new Intl.NumberFormat('en-US', {}).format(
                    batch_images_processed ?? 0,
                  )
                : '-'}
            </p>
            <p className='text-xs text-muted-foreground'>
              {t('dashboard.usage.images_in_batches')}
            </p>
          </CardContent>
        </Card>
      </div>
      <AggregatedUsageList
        usageList={aggregatedUsage}
        daysPassed={daysPassed}
      />
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as ChartTab)}
      >
        <TabsList className='mt-4 mb-4 items-center justify-center grid w-full grid-cols-4'>
          <TabsTrigger value='model' className='data-[state=active]:bg-white'>
            {t('dashboard.usage.tabs.model_usage')}
          </TabsTrigger>
          <TabsTrigger
            value='image-generation'
            className='data-[state=active]:bg-white'
          >
            {t('dashboard.usage.tabs.image_generation')}
          </TabsTrigger>
          <TabsTrigger
            value='image-enhancement'
            className='data-[state=active]:bg-white'
          >
            {t('dashboard.usage.tabs.image_enhancement')}
          </TabsTrigger>
          <TabsTrigger
            value='image-batch-processing'
            className='data-[state=active]:bg-white'
          >
            {t('dashboard.usage.tabs.image_batch_processing')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value='model'>
          {activeTab === 'model' && (
            <Card className='bg-white'>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <ChartColumnIncreasing className='w-4 h-4' />
                  {t('dashboard.usage.charts.model_usage_title')}
                </CardTitle>
                <CardDescription>
                  {t('dashboard.usage.charts.model_usage_desc')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UsageChartDataProvider
                  customerId={customerId}
                  startTime={startTime}
                  endTime={endTime}
                  meteredItemLookupDictionary={meteredItemLookupDictionary}
                  meters={[
                    {
                      meter_id: meterTypes.model,
                      dimension_group_by_keys: ['type', 'model'],
                    },
                  ]}
                >
                  {(props) => <DayTrendChart {...props} />}
                </UsageChartDataProvider>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        <TabsContent value='image-generation'>
          {activeTab === 'image-generation' && (
            <Card className='bg-white'>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Image className='w-4 h-4' />
                  {t('dashboard.usage.charts.image_generation_title')}
                </CardTitle>
                <CardDescription>
                  {t('dashboard.usage.charts.image_generation_desc')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UsageChartDataProvider
                  customerId={customerId}
                  startTime={startTime}
                  endTime={endTime}
                  meteredItemLookupDictionary={meteredItemLookupDictionary}
                  meters={[
                    {
                      meter_id: meterTypes.image_generation,
                      dimension_group_by_keys: ['resolution'],
                    },
                  ]}
                >
                  {(props) => <DayTrendChart {...props} />}
                </UsageChartDataProvider>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        <TabsContent value='image-enhancement'>
          {activeTab === 'image-enhancement' && (
            <Card className='bg-white'>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Sparkles className='w-4 h-4' />
                  {t('dashboard.usage.charts.image_enhancement_title')}
                </CardTitle>
                <CardDescription>
                  {t('dashboard.usage.charts.image_enhancement_desc')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UsageChartDataProvider
                  customerId={customerId}
                  startTime={startTime}
                  endTime={endTime}
                  meteredItemLookupDictionary={meteredItemLookupDictionary}
                  meters={[
                    {
                      meter_id: meterTypes.image_enhancement,
                      dimension_group_by_keys: [],
                    },
                  ]}
                >
                  {(props) => <DayTrendChart {...props} />}
                </UsageChartDataProvider>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        <TabsContent value='image-batch-processing'>
          {activeTab === 'image-batch-processing' && (
            <Card className='bg-white'>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Layers className='w-4 h-4' />
                  {t('dashboard.usage.charts.batch_processing_title')}
                </CardTitle>
                <CardDescription>
                  {t('dashboard.usage.charts.batch_processing_desc')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UsageChartDataProvider
                  customerId={customerId}
                  startTime={startTime}
                  endTime={endTime}
                  meteredItemLookupDictionary={meteredItemLookupDictionary}
                  meters={[
                    {
                      meter_id: meterTypes.batch_image_generation,
                      dimension_group_by_keys: [],
                    },
                  ]}
                >
                  {(props) => <DayTrendChart {...props} />}
                </UsageChartDataProvider>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

function UsageWrapper(props: Omit<UsageProps, 'testClockTime'>) {
  const testClock = useTestClock();

  // Usage component requires time to be defined, so we need to wait for the test clock to be ready
  if (!testClock.time) {
    return null;
  }

  return <Usage testClockTime={testClock.time} {...props} />;
}

export { Usage };
export default UsageWrapper;
