import { Sigma } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const roundDecimal = (value: number) => {
  return Math.round(value * 100) / 100;
};

const AggregatedUsageList = ({
  usageList,
  daysPassed,
}: {
  usageList: any[];
  daysPassed: number;
}) => {
  const { t } = useTranslation();

  return (
    <Card className='bg-white mt-2'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Sigma className='w-4 h-4' />
          {t('dashboard.usage.aggregated.title')}
        </CardTitle>
        <CardDescription>
          {t('dashboard.usage.aggregated.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {usageList.map(
          (i: {
            id?: string;
            bucket_value?: number;
            value?: number;
            display_name?: string;
          }) => (
            <div key={i.id} className='mb-2 flex items-center justify-between'>
              <div>
                <p className='font-medium'>
                  {i.display_name ?? t('dashboard.usage.aggregated.unknown')}
                </p>
              </div>
              <div>
                <p className='text-sm text-gray-600'>
                  {t('dashboard.usage.aggregated.total')}:{' '}
                  {i.bucket_value ?? i.value ?? 0},{' '}
                  {t('dashboard.usage.aggregated.daily_burn')}:{' '}
                  {roundDecimal((i.bucket_value ?? i.value ?? 0) / daysPassed)}
                </p>
              </div>
            </div>
          ),
        )}
      </CardContent>
    </Card>
  );
};

export default AggregatedUsageList;
