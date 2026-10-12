import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import Button from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import Skeleton from '@/components/ui/Skeleton';
import { type UseTestClockResult } from '@/components/hooks/useTestClock';

const AdvanceTestClock = ({ testClock }: { testClock: UseTestClockResult }) => {
  const { t } = useTranslation();
  const [modalTime, setModalTime] = useState<number | null>(testClock.timeInMs);
  const [showClockModal, setShowClockModal] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);

  const advanceTimeBy = (amount: number, unit: string) => {
    let multiplier = 1;
    switch (unit) {
      case 'hour':
        multiplier = 60 * 60 * 1000;
        break;
      case 'day':
        multiplier = 24 * 60 * 60 * 1000;
        break;
      case 'week':
        multiplier = 7 * 24 * 60 * 60 * 1000;
        break;
      case 'month':
        multiplier = 30 * 24 * 60 * 60 * 1000;
        break;
      case 'year':
        multiplier = 365 * 24 * 60 * 60 * 1000;
        break;
    }

    setModalTime((prev) => (prev ?? 0) + amount * multiplier);
    setSelectedUnit(unit);
  };

  const timeButtonClass = (unit: string) =>
    cn(
      'bg-white text-purple border border-purple hover:bg-purple-50 font-normal py-3 text-lg rounded-lg transition-all',
      selectedUnit === unit
        ? 'font-bold ring-4 ring-purple border-2 border-purple'
        : '',
    );

  return (
    <>
      <div className='space-y-4'>
        <div className='flex items-center space-x-2'>
          <div className='bg-primary/20 text-primary px-3 py-1 rounded-full text-sm font-medium'>
            {t('dashboard.simulations.scenario_1')}
          </div>
          <h2 className='text-xl font-semibold'>
            {t('dashboard.simulations.clock_title')}
          </h2>
        </div>

        <Card className='bg-white'>
          <CardHeader className='border-b'>
            <div className='flex items-center space-x-3'>
              <div className='bg-white p-2 rounded-lg'>
                <Clock className='h-5 w-5 text-purple' />
              </div>
              <div>
                <div className='text-sm text-purple-700 font-medium'>
                  {t('dashboard.simulations.clock_current_time')}
                </div>
                <div className='text-lg font-semibold text-purple-900'>
                  {testClock.timeInMs ? (
                    <>
                      {new Date(testClock.timeInMs).toLocaleDateString(
                        'en-US',
                        {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        },
                      )}{' '}
                      |{' '}
                      {new Date(testClock.timeInMs).toLocaleTimeString(
                        'en-US',
                        {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        },
                      )}{' '}
                      GMT-7
                    </>
                  ) : (
                    <Skeleton className='w-40 h-[56px] mr-8' />
                  )}
                </div>
              </div>
            </div>
            <div className='mt-3'>
              <Button
                disabled={testClock.isLoading || testClock.isAdvancing}
                onClick={() => {
                  setModalTime(testClock.timeInMs);
                  setSelectedUnit(null);
                  setShowClockModal(true);
                }}
                className='bg-purple hover:bg-purple-700'
                text={t('dashboard.simulations.advance_time_button')}
              />
            </div>
          </CardHeader>
          <CardContent className='p-4'>
            <div className='bg-background p-4 rounded-lg'>
              <div className='text-sm'>
                <div>
                  <span className='font-medium'>
                    {t('dashboard.simulations.clock_status')}
                  </span>
                  <div>
                    {testClock.isLoading && (
                      <Badge variant='secondary'>
                        {t('dashboard.simulations.clock_status_loading')}
                      </Badge>
                    )}
                    {!testClock.isLoading && testClock.isAdvancing && (
                      <Badge variant='destructive'>
                        {t('dashboard.simulations.clock_status_advancing')}
                      </Badge>
                    )}
                    {!testClock.isLoading && !testClock.isAdvancing && (
                      <Badge className='bg-green-500 text-white'>
                        {t('dashboard.simulations.clock_status_ready')}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Clock Advance Modal */}
      {showClockModal && (
        <div className='fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center pt-20 z-50'>
          <div className='bg-white rounded-lg p-6 w-96 max-w-md'>
            <h3 className='text-lg font-semibold mb-2'>
              {t('dashboard.simulations.clock_advance_title')}
            </h3>

            <div className='mb-4'>
              <p className='text-sm text-gray-700 mb-2'>
                {t('dashboard.simulations.clock_advance_description')}
              </p>
              <p className='text-sm text-gray-700 mb-4'>
                {t('dashboard.simulations.clock_warning')}
              </p>
            </div>

            <div className='mb-4 p-3 border rounded-lg'>
              <div className='flex items-center space-x-3'>
                <div className='bg-purple-100 px-3 py-1 rounded border'>
                  {modalTime
                    ? new Date(modalTime).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })
                    : null}
                </div>
                <div className='flex items-center space-x-2'>
                  <span>
                    {modalTime
                      ? new Date(modalTime).toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true,
                        })
                      : null}
                  </span>
                  <Clock className='h-4 w-4 text-gray-400' />
                  <span className='text-sm text-gray-600'>GMT-7</span>
                </div>
              </div>
            </div>

            <div className='mb-4'>
              <div className='flex flex-col gap-2'>
                <Button
                  onClick={() => advanceTimeBy(1, 'hour')}
                  className={timeButtonClass('hour')}
                  text={t('dashboard.simulations.clock_buttons.hour')}
                />
                <Button
                  onClick={() => advanceTimeBy(1, 'day')}
                  className={timeButtonClass('day')}
                  text={t('dashboard.simulations.clock_buttons.day')}
                />
                <Button
                  onClick={() => advanceTimeBy(1, 'week')}
                  className={timeButtonClass('week')}
                  text={t('dashboard.simulations.clock_buttons.week')}
                />
                <Button
                  onClick={() => advanceTimeBy(1, 'month')}
                  className={timeButtonClass('month')}
                  text={t('dashboard.simulations.clock_buttons.month')}
                />
                <Button
                  onClick={() => advanceTimeBy(1, 'year')}
                  className={timeButtonClass('year')}
                  text={t('dashboard.simulations.clock_buttons.year')}
                />
              </div>
            </div>

            <p className='text-xs text-gray-500 mb-4'>
              {t('dashboard.simulations.clock_note')}
            </p>

            <div className='flex justify-center gap-4'>
              <Button
                onClick={() => setShowClockModal(false)}
                className='bg-white text-purple border border-purple-300 hover:bg-purple-50 w-48 py-3 text-lg'
                text={t('settings.common.cancel')}
              />
              <Button
                onClick={() => {
                  if (modalTime) testClock.updateTime(modalTime);
                  setShowClockModal(false);
                }}
                className='bg-purple hover:bg-purple-700 w-48 py-3 text-lg'
                text={t('simulations.advance')}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AdvanceTestClock;
