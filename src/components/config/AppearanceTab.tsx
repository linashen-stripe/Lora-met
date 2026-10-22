/* eslint-disable i18next/no-literal-string */
import { ChangeEvent } from 'react';
import { useConfigContext } from '@/contexts/ConfigContext';
import CurrencyInfoTooltip from './CurrencyInfoTooltip';

interface SelectOption {
  value: string;
  label: string;
}

interface SettingConfig {
  label: string;
  key: string; // This will be a key of settings
  options: SelectOption[];
  checkoutMethod?: string; // Conditionally render based on settings.checkoutMethod
}

export default function AppearanceTab() {
  const {
    settings,
    updateSetting,
    customer,
    updateCustomer,
    metronomeContract,
  } = useConfigContext();

  const handleCurrencyChange = (value: string) => {
    updateSetting('currency', value);
  };

  // Handle potentially null settings/customer from context during initial renders or if context is not ready
  if (!settings || !customer) {
    // ConfigProvider should handle global loading state.
    // If this component renders, settings/customer are expected to be populated after isLoading is false.
    // However, to satisfy TypeScript's null checks, we guard here.
    return null;
  }

  const isCurrencyLocked = Boolean(metronomeContract);

  const uiSettings: SettingConfig[] = [
    {
      label: 'Currency',
      key: 'currency',
      options: [
        { value: 'usd', label: 'USD' },
        { value: 'cad', label: 'CAD' },
        { value: 'gbp', label: 'GBP' },
        { value: 'eur', label: 'EUR' },
        { value: 'aud', label: 'AUD' },
        { value: 'sgd', label: 'SGD' },
        { value: 'jpy', label: 'JPY' },
        { value: 'sek', label: 'SEK' },
      ],
    },
    {
      label: 'Language',
      key: 'language',
      options: [
        { value: 'en', label: 'English' },
        { value: 'en-GB', label: 'English (UK)' },
        { value: 'fr', label: 'French' },
        { value: 'es', label: 'Spanish' },
        { value: 'de', label: 'German' },
        { value: 'it', label: 'Italian' },
        { value: 'ja', label: 'Japanese' },
        { value: 'zh', label: 'Chinese (Simplified)' },
      ],
    },
    {
      label: 'Credit Purchase Checkout',
      key: 'checkoutMethod',
      options: [
        { value: 'elements', label: 'Elements' },
        {
          value: 'embedded_page',
          label: 'Embedded page',
        },
        { value: 'form', label: 'Form' },
        { value: 'hosted_page', label: 'Hosted page' },
      ],
    },
    {
      label: 'Checkout Form layout',
      key: 'checkoutFormLayout',
      options: [
        { value: 'compact', label: 'Compact (multi-step)' },
        { value: 'expanded', label: 'Expanded (single page)' },
      ],
    },
  ];

  return (
    <div className='space-y-4'>
      {uiSettings.map(
        ({ label, key, options, checkoutMethod }) =>
          (!checkoutMethod || checkoutMethod === settings.checkoutMethod) && (
            <div key={key}>
              <div className='mb-2 flex items-center gap-1'>
                <label className='text-sm font-medium text-gray-700'>
                  {label}
                </label>
                {label === 'Currency' &&
                  key === 'currency' &&
                  isCurrencyLocked && <CurrencyInfoTooltip />}
              </div>
              <select
                disabled={key === 'currency' && isCurrencyLocked}
                value={
                  key === 'checkoutMethod' &&
                  ![
                    'elements',
                    'embedded_page',
                    'form',
                    'hosted_page',
                  ].includes(settings[key] as string)
                    ? 'form'
                    : (settings[key] as string)
                }
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  key === 'currency'
                    ? handleCurrencyChange(e.target.value)
                    : updateSetting(key, e.target.value)
                }
                className='w-full p-2 border border-gray-300 rounded-md text-gray-700 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
              >
                {options.map(({ value, label: optionLabel }) => (
                  <option key={value} value={value}>
                    {optionLabel}
                  </option>
                ))}
              </select>
              {key === 'checkoutMethod' && (
                <p className='mt-2 text-xs text-gray-500'>
                  Credit purchase currently supports Form and Hosted page.
                  Elements and Embedded page fall back to Form until they are
                  supported.
                </p>
              )}
              {key === 'checkoutFormLayout' && (
                <p className='mt-2 text-xs text-gray-500'>
                  Applies to Form and fallback Form modes only. Hosted page
                  controls its own layout.
                </p>
              )}
            </div>
          ),
      )}
      {/* Assuming customer object structure from ConfigContext is { email: string, ... } */}
      {[{ label: 'Customer email', key: 'email' }].map(({ label, key }) => (
        <div key={key}>
          <label className='block mb-2 text-sm font-medium text-gray-700'>
            {label}
          </label>
          <input
            type='email'
            value={customer[key as keyof typeof customer] as string} // Type assertion
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              updateCustomer({ [key]: e.target.value });
            }}
            placeholder='Enter to override .env value'
            className='w-full p-2 border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
          />
        </div>
      ))}
    </div>
  );
}
