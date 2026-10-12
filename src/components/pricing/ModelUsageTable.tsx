'use client';

import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ModelRate {
  name: string;
  input: string;
  output: string;
}

interface ModelUsageTableProps {
  rates: ModelRate[];
}

export default function ModelUsageTable({ rates }: ModelUsageTableProps) {
  const { t } = useTranslation();

  return (
    <div>
      <h3 className='text-2xl font-semibold mb-4 text-foreground'>
        {t('pricing.charts.model_usage_title')}
      </h3>
      <Card className=''>
        <Table>
          <TableHeader>
            <TableRow className='hover:bg-transparent'>
              <TableHead className='text-lg text-gray-700'>
                {t('pricing.charts.model_header')}
              </TableHead>
              <TableHead className='text-right text-lg text-gray-700'>
                {t('pricing.charts.input_header')}
              </TableHead>
              <TableHead className='text-right text-lg text-gray-700'>
                {t('pricing.charts.output_header')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rates.map((rate) => (
              <TableRow
                key={rate.name}
                className='hover:bg-primary/10 transition-colors'
              >
                <TableCell className='font-medium text-lg text-gray-900'>
                  {rate.name}
                </TableCell>
                <TableCell className='text-right text-lg text-gray-800'>
                  {rate.input}
                </TableCell>
                <TableCell className='text-right text-lg text-gray-800'>
                  {rate.output}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
