import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useConfigContext } from '@/contexts/ConfigContext';
import {
  getEffectiveMetronomeCustomerId,
  getStripeCustomerIdFromCustomer,
} from '@/config/metronomeDefaults';
import fetchClient from '@/utils/fetchClient';
import { UnifiedDashboardData } from '@/utils/types';

const fetchDashboardData = async ({
  customerId,
  stripeCustomerIdForPath,
  includeUsageData = false,
  metronomeCustomerId,
}: {
  customerId: string;
  /** When set, used in the URL path so `/api/dashboard/...` can resolve `cus_…`. */
  stripeCustomerIdForPath?: string;
  includeUsageData?: boolean;
  metronomeCustomerId?: string;
}): Promise<UnifiedDashboardData> => {
  const params = new URLSearchParams();
  if (includeUsageData) params.set('includeUsage', 'true');
  if (metronomeCustomerId) params.set('mc', metronomeCustomerId);
  const qs = params.toString();
  const pathId = stripeCustomerIdForPath || customerId;
  const url = `/api/dashboard/${pathId}${qs ? `?${qs}` : ''}`;
  const response = await fetchClient.get(url);
  return response.data;
};

// Query key factory for dashboard data
export const dashboardKeys = {
  all: ['dashboard'] as const,
  data: (
    customerId: string,
    includeUsage: boolean,
    metronomeCustomerId?: string,
    stripePathId?: string,
  ) =>
    [
      ...dashboardKeys.all,
      customerId,
      includeUsage,
      metronomeCustomerId ?? '',
      stripePathId ?? '',
    ] as const,
};

const useDashboardData = (
  includeUsageData = false,
): [boolean, UnifiedDashboardData | null, () => void] => {
  const { customer } = useConfigContext();
  const queryClient = useQueryClient();

  const customerId = customer?.id ?? null;
  const metronomeCustomerId = customer
    ? getEffectiveMetronomeCustomerId(customer)
    : undefined;
  const stripeCustomerIdForPath = customer
    ? getStripeCustomerIdFromCustomer(customer)
    : undefined;

  /** Metronome-first: only need app customer + Metronome id (`mc` is always sent). */
  const enabled = Boolean(customerId && metronomeCustomerId);

  const { data, isLoading, refetch } = useQuery({
    queryKey: dashboardKeys.data(
      customerId || '',
      includeUsageData,
      metronomeCustomerId,
      stripeCustomerIdForPath,
    ),
    queryFn: () =>
      fetchDashboardData({
        customerId: customerId!,
        stripeCustomerIdForPath,
        includeUsageData,
        metronomeCustomerId,
      }),
    enabled,
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const triggerRefetch = () => {
    refetch();
  };

  return [isLoading, data ?? null, triggerRefetch];
};

export const useInvalidateDashboard = () => {
  const queryClient = useQueryClient();
  const { customer } = useConfigContext();

  return () => {
    if (customer?.id) {
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.all,
      });
      queryClient.invalidateQueries({
        queryKey: ['invoices', customer.id],
      });
    }
  };
};

export default useDashboardData;
