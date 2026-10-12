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

interface ImageRate {
  service: string;
  price: string;
}

interface ImageGenerationTableProps {
  rates: ImageRate[];
}

export default function ImageGenerationTable({
  rates,
}: ImageGenerationTableProps) {
  const { t } = useTranslation();

  return (
    <div>
      <h3 className='text-2xl font-semibold mb-4 text-foreground'>
        {t('pricing.charts.image_generation_title')}
      </h3>
      <Card className='bg-white'>
        <Table>
          <TableHeader>
            <TableRow className='hover:bg-transparent'>
              <TableHead className='text-lg text-gray-700'>
                {t('pricing.charts.service_header')}
              </TableHead>
              <TableHead className='text-right text-lg text-gray-700'>
                {t('pricing.charts.price_header')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rates.map((rate) => (
              <TableRow
                key={rate.service}
                className='hover:bg-primary/10 transition-colors'
              >
                <TableCell className='font-medium text-lg text-gray-900'>
                  {rate.service}
                </TableCell>
                <TableCell className='text-right text-lg text-gray-800'>
                  {rate.price}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
