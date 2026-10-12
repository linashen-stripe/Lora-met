'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type UsageChartRefreshContextValue = {
  invoicePacingRefreshKey: number;
  bumpInvoicePacingChart: () => void;
};

const UsageChartRefreshContext =
  createContext<UsageChartRefreshContextValue | null>(null);

export function UsageChartRefreshProvider({ children }: { children: ReactNode }) {
  const [invoicePacingRefreshKey, setKey] = useState(0);
  const bumpInvoicePacingChart = useCallback(() => {
    setKey((k) => k + 1);
  }, []);

  const value = useMemo(
    () => ({ invoicePacingRefreshKey, bumpInvoicePacingChart }),
    [invoicePacingRefreshKey, bumpInvoicePacingChart],
  );

  return (
    <UsageChartRefreshContext.Provider value={value}>
      {children}
    </UsageChartRefreshContext.Provider>
  );
}

export function useUsageChartRefresh() {
  const ctx = useContext(UsageChartRefreshContext);
  if (!ctx) {
    throw new Error(
      'useUsageChartRefresh must be used within UsageChartRefreshProvider',
    );
  }
  return ctx;
}
