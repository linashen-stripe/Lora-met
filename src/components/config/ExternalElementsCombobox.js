/* eslint-disable i18next/no-literal-string */
'use client';

import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Label,
} from '@headlessui/react';
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/20/solid';
import { useState } from 'react';
import { EXTERNAL_PAYMENT_METHODS } from '../utils/stripe/externalPaymentMethods';

const ExternalElementsComboBox = ({ selectedMethod, setSelectedMethod }) => {
  const [query, setQuery] = useState('');

  const filteredMethods =
    query === ''
      ? EXTERNAL_PAYMENT_METHODS
      : EXTERNAL_PAYMENT_METHODS.filter((method) => {
          return (
            method.value.toLowerCase().includes(query.toLowerCase()) ||
            method.id.toLowerCase().includes(query.toLowerCase())
          );
        });

  return (
    <Combobox
      as='div'
      value={selectedMethod}
      onChange={(method) => {
        setQuery('');
        setSelectedMethod(method);
      }}
    >
      <Label className='block text-sm font-medium leading-6 text-gray-700'>
        External Payment Method
      </Label>
      <div className='relative mt-2'>
        <ComboboxInput
          className='w-full p-2 border border-gray-300 rounded-md text-gray-700 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
          onChange={(event) => setQuery(event.target.value)}
          onBlur={() => setQuery('')}
          displayValue={(method) => method?.value}
        />
        <ComboboxButton className='absolute inset-y-0 right-0 flex items-center rounded-r-md px-2 focus:outline-none'>
          <ChevronUpDownIcon
            className='h-5 w-5 text-gray-400'
            aria-hidden='true'
          />
        </ComboboxButton>

        {filteredMethods.length > 0 && (
          <ComboboxOptions className='absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm'>
            {filteredMethods.map((method) => (
              <ComboboxOption
                key={method.id}
                value={method}
                className='group relative cursor-default select-none py-2 pl-3 pr-9 text-gray-900 data-[focus]:bg-indigo-600 data-[focus]:text-white'
              >
                <span className='block truncate group-data-[selected]:font-semibold'>
                  {method.value}
                </span>

                <span className='absolute inset-y-0 right-0 hidden items-center pr-4 text-indigo-600 group-data-[selected]:flex group-data-[focus]:text-white'>
                  <CheckIcon className='h-5 w-5' aria-hidden='true' />
                </span>
              </ComboboxOption>
            ))}
          </ComboboxOptions>
        )}
      </div>
    </Combobox>
  );
};

export default ExternalElementsComboBox;
