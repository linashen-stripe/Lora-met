'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { subDays, format } from 'date-fns';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { useConfigContext } from '@/contexts/ConfigContext';
import fetchClient from '@/utils/fetchClient';

const chartConfig = {
  usage: {
    label: 'Usage',
    color: 'hsl(var(--primary))',
  },
} satisfies ChartConfig;

const generateMockData = () => {
  return Array.from({ length: 30 }, (_, i) => {
    const date = subDays(new Date(), 29 - i);
    return {
      date: format(date, 'MMM d'),
      usage: Math.floor(Math.random() * 2000) + 500,
    };
  });
};

const useTrendData = (customerId: string | null) => {
  return useQuery({
    queryKey: ['thirtyDayTrend', customerId],
    queryFn: async () => {
      const metersResponse = await fetchClient.get('/api/stripe/meter');
      const meters = metersResponse.data.meters;

      if (!meters || meters.length === 0) {
        return generateMockData();
      }

      const meterId = meters[0].id;
      const historyResponse = await fetchClient.get(
        `/api/stripe/meter/${meterId}/history?customerId=${customerId}`,
      );
      const historyData = historyResponse.data.data;

      const processedData = Array.from({ length: 30 }, (_, i) => {
        const date = subDays(new Date(), 29 - i);
        return {
          date: format(date, 'MMM d'),
          usage: 0,
        };
      });

      const usageMap = new Map(processedData.map((d) => [d.date, d.usage]));

      historyData.forEach((item: { time: number; total_value: number }) => {
        const itemDate = format(new Date(item.time * 1000), 'MMM d');
        if (usageMap.has(itemDate)) {
          usageMap.set(
            itemDate,
            (usageMap.get(itemDate) || 0) + item.total_value,
          );
        }
      });

      return Array.from(usageMap, ([date, usage]) => ({ date, usage }));
    },
    enabled: Boolean(customerId),
    staleTime: 30 * 1000,
    placeholderData: generateMockData,
  });
};

const ThirtyDayTrendChart = () => {
  const { customer } = useConfigContext();
  const { data: usageData = generateMockData() } = useTrendData(
    customer?.id || null,
  );

  return (
    <ResponsiveContainer width='100%' height={300}>
      <ChartContainer config={chartConfig}>
        <BarChart accessibilityLayer data={usageData}>
          <XAxis
            dataKey='date'
            tickLine={false}
            tickMargin={10}
            axisLine={false}
            name='Date'
          />
          <YAxis name='Tokens' />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          <Bar dataKey='usage' fill='var(--color-usage)' radius={8} />
        </BarChart>
      </ChartContainer>
    </ResponsiveContainer>
  );
};

export default ThirtyDayTrendChart;
