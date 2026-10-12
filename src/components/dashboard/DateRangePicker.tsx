'use client';

import type React from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type DateRange = 'current-billing' | 'last-7-days' | 'last-30-days';

interface DateRangeSelectorProps {
  value: DateRange;
  onChange: (value: DateRange) => void;
}

export default function DateRangeSelector({
  value,
  onChange,
}: DateRangeSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className='flex items-center gap-2'>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className='w-[180px] bg-white'>
          <Calendar className='h-4 w-4 mr-2' />
          <SelectValue />
        </SelectTrigger>
        <SelectContent className='bg-white'>
          <SelectItem value='last-7-days'>
            {t('dashboard.date_picker.last_7_days')}
          </SelectItem>
          <SelectItem value='last-30-days'>
            {t('dashboard.date_picker.last_30_days')}
          </SelectItem>
          <SelectItem value='current-billing'>
            {t('dashboard.date_picker.current_billing_period')}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
