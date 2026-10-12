/* eslint-disable i18next/no-literal-string */
import { useState, ChangeEvent } from 'react';
import ExternalElementsComboBox from './ExternalElementsCombobox';
import { useConfigContext } from '@/contexts/ConfigContext';
import { defaultDemoSettings } from '@/config/config';
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

// Assuming ExternalElementsComboBox provides a method object like this in its callback,
// or null/undefined if nothing is selected.
interface EpmMethod {
  id: string;
  // ... other properties the method object might have
}

export default function AppearanceTab() {
  const {
    settings,
    updateSetting,
    customer,
    updateCustomer,
    triggerElementsRefresh,
    subscription,
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

  const isCurrencyLocked = Boolean(
    customer?.activeSubscription || subscription?.id,
  );

  const currentExternalPaymentMethod = (settings as any)[
    'externalPaymentMethod'
  ];
  const defaultExternalPaymentMethod = (defaultDemoSettings as any)[
    'externalPaymentMethod'
  ];

  const [localExternalPaymentMethod, setLocalExternalPaymentMethod] =
    // TODO: this eslint rule is disabled because it's a bit of a hack to get the default value for the external payment method
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useState<string>(
      currentExternalPaymentMethod &&
        currentExternalPaymentMethod !== defaultExternalPaymentMethod
        ? currentExternalPaymentMethod
        : '',
    );

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
      label: 'Checkout Integration',
      key: 'checkoutMethod',
      options: [
        { value: 'embedded-checkout', label: 'Embedded full page' },
        { value: 'elements-checkout', label: 'Elements w/ PI' },
        { value: 'stripe-checkout', label: 'Hosted full page' },
        // {
        //   value: 'elements-checkout-with-checkout-sessions',
        //   label: 'Elements with Checkout Sessions',
        // },
      ],
    },
    {
      label: 'Elements Style',
      checkoutMethod: 'elements-checkout',
      key: 'elementsStyle',
      options: [
        { value: 'tabs', label: 'Tabs' },
        { value: 'accordion', label: 'Accordion' },
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
                value={settings[key] as string} // Assuming settings values are strings for selects
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
            </div>
          ),
      )}

      {settings.checkoutMethod === 'elements-checkout' && (
        <>
          <ExternalElementsComboBox
            selectedMethod={localExternalPaymentMethod} // Assuming ExternalElementsComboBox expects string ID
            setSelectedMethod={(method: EpmMethod | null) => {
              const methodId = method?.id;
              updateSetting('externalPaymentMethod', methodId);
              triggerElementsRefresh();
              setLocalExternalPaymentMethod(methodId || '');
            }}
          />

          <div className='mt-4 space-y-2'>
            <div className='flex items-center'>
              <input
                id='eceEnabled'
                type='checkbox'
                checked={!!settings['eceEnabled']} // Use bracket notation and ensure boolean
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  updateSetting('eceEnabled', e.target.checked)
                }
                className='h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded'
              />
              <label
                htmlFor='eceEnabled'
                className='ml-2 block text-sm text-gray-900'
              >
                Express Checkout Element
              </label>
            </div>
            <div className='flex items-center'>
              <input
                id='addressEnabled'
                type='checkbox'
                checked={!!settings['addressEnabled']} // Use bracket notation and ensure boolean
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  updateSetting('addressEnabled', e.target.checked)
                }
                className='h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded'
              />
              <label
                htmlFor='addressEnabled'
                className='ml-2 block text-sm text-gray-900'
              >
                Address Element
              </label>
            </div>
          </div>
        </>
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
