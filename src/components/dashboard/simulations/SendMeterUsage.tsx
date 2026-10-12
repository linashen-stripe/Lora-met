import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import Button from '@/components/ui/Button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Zap } from 'lucide-react';
import fetchClient from '@/utils/fetchClient';
import { useConfigContext } from '@/contexts/ConfigContext';
import { type UseTestClockResult } from '@/components/hooks/useTestClock';

interface UsageData {
  [key: string]: string;
}

const SendMeterUsage = ({
  meteredItems,
  testClock,
}: {
  meteredItems: any[];
  testClock: UseTestClockResult;
}) => {
  const { customer } = useConfigContext();
  const { t } = useTranslation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [usageData, setUsageData] = useState<UsageData>({});

  const handleUsageDataChange = (field: string, value: string) => {
    setUsageData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSendUsage = async () => {
    // Transform the usage data into the format expected by the API
    const postData = Object.keys(usageData).map((key) => {
      const item = meteredItems.find((i) => i.id === key);

      return {
        eventName: item?.meter_event_name,
        amount: Number(usageData[key]),
        meter_segment_conditions: item?.meter_segment_conditions ?? [],
      };
    });

    // Indicate loading state
    setIsProcessing(true);

    try {
      await fetchClient.post('/api/stripe/meter/send-bulk-usage', {
        customerId: customer?.id,
        data: postData,
      });

      setShowUsageModal(false);
      setUsageData({});
    } catch (error) {
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <div className='space-y-4'>
        <div className='flex items-center space-x-2'>
          <div className='bg-primary/20 text-primary px-3 py-1 rounded-full text-sm font-medium'>
            {t('dashboard.simulations.scenario_2')}
          </div>
          <h2 className='text-xl font-semibold'>
            {t('dashboard.simulations.usage_title')}
          </h2>
        </div>

        <Card className='bg-white'>
          <CardHeader>
            <div className='flex items-center justify-between'>
              <div className='flex items-center space-x-2'>
                <Zap className='h-5 w-5 text-purple' />
                <CardTitle>{t('dashboard.simulations.usage_title')}</CardTitle>
              </div>
              {isProcessing ? (
                <Badge variant='default'>
                  {t('dashboard.simulations.usage_status_sending')}
                </Badge>
              ) : (
                <Badge className='bg-primary/10 text-primary border-primary/30 border hover:bg-primary/20'>
                  {t('dashboard.simulations.usage_status_idle')}
                </Badge>
              )}
            </div>
            <CardDescription>
              {t('dashboard.simulations.usage_description')}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <Button
              className='bg-purple hover:bg-purple-hover'
              disabled={
                isProcessing || testClock.isLoading || testClock.isAdvancing
              }
              onClick={() => setShowUsageModal(true)}
              text={t('dashboard.simulations.usage_title')}
            />
          </CardContent>
        </Card>
      </div>

      {showUsageModal && (
        <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
          <div className='bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto'>
            <h3 className='text-lg font-semibold mb-4'>
              {t('dashboard.simulations.usage_modal_title')}
            </h3>

            <div className='grid grid-cols-1 md:grid-cols-2 gap-2'>
              {meteredItems.map((i: any) => {
                return (
                  <div key={i.id}>
                    <Label htmlFor={i.id}>{i.display_name}</Label>
                    <Input
                      id={i.id}
                      type='number'
                      min='0'
                      placeholder={t('dashboard.simulations.usage_placeholder')}
                      value={usageData[i.id] ?? ''}
                      onChange={(e) =>
                        handleUsageDataChange(i.id, e.target.value)
                      }
                    />
                  </div>
                );
              })}
            </div>

            <div className='flex justify-end space-x-2 mt-6'>
              <Button
                onClick={() => setShowUsageModal(false)}
                text={t('settings.common.cancel')}
              />
              <Button
                onClick={() => {
                  handleSendUsage();
                }}
                className='bg-green-600 hover:bg-green-700'
                text={t('dashboard.simulations.usage_send_button')}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SendMeterUsage;
