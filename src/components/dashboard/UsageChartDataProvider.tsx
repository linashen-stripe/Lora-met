import { useMemo, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Stripe from 'stripe';
import fetchClient from '@/utils/fetchClient';
import Skeleton from '@/components/ui/Skeleton';

export type RawUsageChartData = Stripe.Billing.Analytics.MeterUsageRow[];
export type UsageChartData = Array<
  Stripe.Billing.Analytics.MeterUsageRow & {
    label: string;
  }
>;

// Generates a key for the metered item based on the meter ID and dimensions
const getMeteredItemLookupKey = (item: {
  meter?: string | null;
  meter_id?: string;
  dimensions?: Record<string, string> | null;
}) => {
  const meterId = item.meter ?? item.meter_id ?? '';
  const dimensionString = item.dimensions
    ? Object.values(item.dimensions).join('_')
    : '';
  return dimensionString.length > 0 ? `${meterId}-${dimensionString}` : meterId;
};

// Adds a label to the chart data based on the metered item lookup dictionary
const addLabelToChartData = (
  chartData: RawUsageChartData,
  meteredItemLookupDictionary: Record<string, any>,
): UsageChartData => {
  return chartData.map((row) => ({
    ...row,
    label:
      meteredItemLookupDictionary[getMeteredItemLookupKey(row)]?.display_name,
  }));
};

/**
 * Fetch the usage for the given meters and dimensions
 * @param customerId - The customer ID
 * @param startTime - The start time
 * @param endTime - The end time
 * @param meters - The meters to fetch usage for
 * @param children - The children to render the chart data
 * @returns The chart data
 */
const UsageChartDataProvider = memo(function UsageChartDataProvider({
  customerId,
  startTime: propStartTime,
  endTime: propEndTime,
  meters,
  meteredItemLookupDictionary,
  children,
}: {
  customerId: string | null;
  startTime: number;
  endTime: number;
  meters: {
    meter_id: string;
    dimension_group_by_keys: string[];
  }[];
  meteredItemLookupDictionary: Record<string, string>;
  children: (data: {
    chartData: UsageChartData;
    startTime: number;
    endTime: number;
  }) => React.ReactNode;
}) {
  // Create stable key from meters array
  const metersKey = useMemo(
    () =>
      meters
        .map(
          (m) => `${m.meter_id}:${m.dimension_group_by_keys?.join(',') ?? ''}`,
        )
        .sort()
        .join('|'),
    [meters],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ['meterUsage', customerId, metersKey, propStartTime, propEndTime],
    queryFn: async () => {
      const response = await fetchClient.post('/api/stripe/meter/usage', {
        customer: customerId,
        start_time: propStartTime,
        end_time: propEndTime,
        meters: meters,
        value_grouping_window: 'day',
      });
      const body = response.data as {
        data?: RawUsageChartData;
        rows?: { data?: RawUsageChartData };
      };
      const rows = body?.data ?? body?.rows?.data ?? [];
      return addLabelToChartData(rows, meteredItemLookupDictionary);
    },
    enabled: Boolean(customerId),
  });

  // Handle undefined data state
  if (isLoading) {
    return <Skeleton className='h-[300px] w-full' />;
  }

  if (error) {
    return (
      <div className='h-[300px] w-full flex items-center justify-center text-muted-foreground'>
        Failed to load chart data. Please try refreshing the page.
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return children({
    chartData: data,
    startTime: propStartTime,
    endTime: propEndTime,
  });
});

export default UsageChartDataProvider;
