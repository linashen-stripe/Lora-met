'use client';

import React from 'react';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { addDays, format, differenceInDays } from 'date-fns';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import type { UsageChartData } from '@/components/dashboard/UsageChartDataProvider';

type UsageData = Array<{
  [key: string]: string | number;
}>;

const COLORS = [
  '#3083DC',
  '#62A1E4',
  '#828E82',
  '#AAAE8E',
  '#0C7C59',
  '#14CC92',
  '#2B303A',
  '#454E5E',
  '#CC4B00',
  '#FF640A',
];

const DayTrendChart = ({
  chartData,
  startTime,
  endTime,
}: {
  chartData: UsageChartData;
  startTime: number;
  endTime: number;
}) => {
  const { config, usageData, barChartKeys } = React.useMemo(() => {
    const startDate = new Date(startTime * 1000);
    const endDate = new Date(endTime * 1000);
    const daysPassed = differenceInDays(endDate, startDate);

    // Fill in skeleton data for each day
    const days: UsageData = Array.from({ length: daysPassed }, (_, i) => {
      const date = addDays(startDate, 1 + i);
      return {
        date: format(date, 'MMM d'),
      };
    });

    const config: ChartConfig = {};

    if (chartData.length === 0) {
      // If there is no data, fill in chart with zeros
      days.forEach((d) => (d.usage = 0));
      config.usage = {
        label: 'Usage',
      };
      return { config, usageData: days, barChartKeys: [] };
    } else {
      // Aggregate usage day for each day
      chartData.forEach((data: UsageChartData[number]) => {
        const dayOf = new Date((data.starts_at ?? 0) * 1000);
        const dayOfIndex = differenceInDays(dayOf, startDate);

        const key = data.dimensions
          ? Object.values(data?.dimensions ?? {}).join('-')
          : 'usage';

        days[dayOfIndex][key] = data.value ?? 0;

        if (!config[key]) {
          config[key] = {
            label: data.label,
          };
        }
      });
    }

    // Filter and sort the keys to ensure the order is consisent when creating the chart
    const barChartKeys = Object.keys(config)
      .filter((k) => k !== 'date')
      .toSorted();

    return { config, usageData: days, barChartKeys };
  }, [chartData, startTime, endTime]);

  return (
    <ResponsiveContainer width='100%' height={300}>
      <ChartContainer config={config}>
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
          {barChartKeys.map((k, i) => (
            <Bar key={k} dataKey={k} stackId='a' fill={COLORS[i]} />
          ))}
        </BarChart>
      </ChartContainer>
    </ResponsiveContainer>
  );
};

export default DayTrendChart;
