'use client';

import Stripe from 'stripe';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useConfigContext } from '@/contexts/ConfigContext';
import fetchClient from '@/utils/fetchClient';

export type UseTestClockResult = {
  time: number | null;
  timeInMs: number | null;
  isLoading: boolean;
  isAdvancing: boolean;
  updateTime: (newTime: number) => void;
  waitForReady: (maxWaitMs?: number) => Promise<boolean>;
  fetchTestClock: () => Promise<Stripe.TestHelpers.TestClock | null>;
};

// Query key factory for test clock data
export const testClockKeys = {
  all: ['test-clock'] as const,
  detail: (testClockId: string) => [...testClockKeys.all, testClockId] as const,
};

/**
 * Custom hook to manage the test clock for the dashboard
 * Uses React Query for shared state across all consumers
 */
const useTestClock = (): UseTestClockResult => {
  const { customer } = useConfigContext();
  const queryClient = useQueryClient();
  const testClockId = customer?.testClockId ?? null;

  // Main query - fetches test clock and polls when advancing
  const { data, isLoading } = useQuery({
    queryKey: testClockKeys.detail(testClockId || ''),
    queryFn: async () => {
      const res = await fetchClient.get(
        `/api/stripe/test-clock/${testClockId}`,
      );
      return res.data as Stripe.TestHelpers.TestClock;
    },
    enabled: Boolean(testClockId),
    // Keep data fresh for 5 minutes - test clock rarely changes except when advancing
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    // Always refetch when window regains focus (in case user advanced clock in Stripe Dashboard)
    refetchOnWindowFocus: 'always',
    refetchInterval: (query) => {
      // Poll every 1s while advancing, stop when ready
      const status = query.state.data?.status;
      return status === 'advancing' ? 1000 : false;
    },
  });

  const isAdvancing = data?.status === 'advancing';
  const time = data?.frozen_time ?? null;

  // Mutation for advancing the test clock
  const advanceMutation = useMutation({
    mutationFn: async (newTime: number) => {
      const res = await fetchClient.post('/api/stripe/test-clock/advance', {
        id: testClockId,
        frozenTime: Math.floor(newTime / 1000),
      });
      return res.data as Stripe.TestHelpers.TestClock;
    },
    onSuccess: (data) => {
      // Update cache immediately, polling handles the rest
      if (testClockId) {
        queryClient.setQueryData(testClockKeys.detail(testClockId), data);
      }
    },
    onError: (error) => {
      console.error('Error advancing test clock:', error);
    },
  });

  // Wait for the test clock to be ready (not advancing)
  const waitForReady = async (maxWaitMs = 180000): Promise<boolean> => {
    if (!testClockId) return true;

    // Check current cache state
    const currentData = queryClient.getQueryData<Stripe.TestHelpers.TestClock>(
      testClockKeys.detail(testClockId),
    );
    if (currentData?.status !== 'advancing') return true;

    // Poll cache until ready, with timeout
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const data = queryClient.getQueryData<Stripe.TestHelpers.TestClock>(
        testClockKeys.detail(testClockId),
      );
      if (data?.status !== 'advancing') return true;
    }

    console.warn('Test clock did not become ready within timeout');
    return false;
  };

  // Fetch test clock data (for consumers that need the raw data)
  const fetchTestClock =
    async (): Promise<Stripe.TestHelpers.TestClock | null> => {
      if (!testClockId) return null;
      try {
        const data = await queryClient.fetchQuery({
          queryKey: testClockKeys.detail(testClockId),
          queryFn: async () => {
            const res = await fetchClient.get(
              `/api/stripe/test-clock/${testClockId}`,
            );
            return res.data as Stripe.TestHelpers.TestClock;
          },
        });
        return data;
      } catch (error) {
        console.error('Error fetching test clock:', error);
        return null;
      }
    };

  return {
    time,
    timeInMs: time ? time * 1000 : null,
    isLoading,
    isAdvancing,
    updateTime: (newTime: number) => {
      if (testClockId) {
        advanceMutation.mutate(newTime);
      }
    },
    waitForReady,
    fetchTestClock,
  };
};

export default useTestClock;
