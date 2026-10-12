'use client';

import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import fetchClient from '@/utils/fetchClient';
import { useConfigContext } from '@/contexts/ConfigContext';
import { useTranslation } from 'react-i18next';

interface SimulateUsageModalProps {
  meters: Meter[];
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}

interface Meter {
  id: string;
  event_name: string;
  display_name: string;
}

interface Simulations {
  [id: string]: number;
}

interface MeterUsage {
  [key: string]: number;
}

export default function SimulateUsageModal({
  meters,
  open,
  setOpen,
}: SimulateUsageModalProps) {
  const { t } = useTranslation();
  const [simulations, setSimulations] = useState<Simulations>({});
  const [simulating, setSimulating] = useState<boolean>(false);
  const { customer, updateCustomer } = useConfigContext();

  const handleClose = () => {
    setOpen(false);
  };

  const handleInputChange = (meterId: string, value: string) => {
    setSimulations((prev: Simulations) => ({
      ...prev,
      [meterId]: parseInt(value) || 0,
    }));
  };

  const handleSimulate = async (meter: Meter) => {
    if (simulating || !simulations[meter.id] || simulations[meter.id] < 1) {
      return;
    }

    setSimulating(true);
    const res = await fetchClient.patch(
      `/api/stripe/meter/${meter.event_name}`,
      {
        customerId: customer?.id,
        amount: simulations[meter.id],
      },
    );
    setOpen(false);
    setSimulating(false);
  };

  useEffect(() => {
    if (!meters) {
      return;
    }

    const defaultUsage: MeterUsage = {};
    meters.forEach((meter) => {
      defaultUsage[meter.id] = 100000;
    });
    setSimulations(defaultUsage);
  }, [meters]);

  return (
    <Dialog open={open} onClose={handleClose} className='relative z-10'>
      <DialogBackdrop
        transition
        className='fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in'
      />

      <div className='fixed inset-0 z-10 w-screen overflow-y-auto'>
        <div className='flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0'>
          <DialogPanel
            transition
            className='relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all data-[closed]:translate-y-4 data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in sm:my-8 sm:w-full sm:max-w-lg sm:p-6 data-[closed]:sm:translate-y-0 data-[closed]:sm:scale-95'
          >
            <div className='absolute right-0 top-0 pr-4 pt-4'>
              <button
                type='button'
                className='rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple focus:ring-offset-2'
                onClick={handleClose}
              >
                <span className='sr-only'>{t('settings.meter.close')}</span>
                <XMarkIcon className='h-6 w-6' aria-hidden='true' />
              </button>
            </div>
            <DialogTitle
              as='h3'
              className='text-lg font-medium leading-6 text-gray-900 mb-4'
            >
              {t('settings.meter.simulate')}
            </DialogTitle>
            <div className='mt-2'>
              {meters.map((meter) => (
                <div key={meter.id} className='mb-4 flex items-center'>
                  <label
                    htmlFor={meter.id}
                    className='block text-sm font-medium text-gray-700 mr-2 w-1/2'
                  >
                    {meter.display_name}
                  </label>
                  <input
                    value={simulations[meter.id]}
                    type='number'
                    id={meter.id}
                    min={0}
                    className='w-1/3 appearance-none block px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-purple focus:border-purple sm:text-sm'
                    placeholder={t('settings.meter.enter_amount')}
                    onChange={(e) =>
                      handleInputChange(meter.id, e.target.value)
                    }
                  />
                  <button
                    type='button'
                    onClick={() => handleSimulate(meter)}
                    className=' w-1/4 ml-2 inline-flex justify-center rounded-md border border-transparent bg-purple px-4 py-2 text-sm font-medium text-button-color shadow-sm hover:bg-purple-hover focus:outline-none focus:ring-2 focus:ring-purple focus:ring-offset-2'
                  >
                    {t('settings.meter.sim')}
                  </button>
                </div>
              ))}
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}
