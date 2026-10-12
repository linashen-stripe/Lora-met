/* eslint-disable i18next/no-literal-string */
'use client';

import { useConfigContext } from '@/contexts/ConfigContext';
import Image from 'next/image';
import Link from 'next/link';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { useState } from 'react';
import { useCart } from '@/contexts/CartContext';
import { useTranslation } from 'react-i18next';
import TabSelector from './TabSelector';
import AppearanceTab from './AppearanceTab';
import AccountTab from './AccountTab';
import DemoModeSwitcher from '../DemoModeSwitcher';

export default function ToolsPanel() {
  const { t } = useTranslation();
  const {
    settings,
    isToolsPanelOpen,
    toggleToolsPanel,
    isLoading,
    resetSettings,
  } = useConfigContext();
  const { clearCart } = useCart();
  const [activeTab, setActiveTab] = useState('Demo');
  const [isResetConfirming, setIsResetConfirming] = useState(false);
  if (!settings) return null;

  if (isLoading) {
    return (
      <div className='bg-gray-100 p-4 mb-4 rounded-lg text-sm animate-pulse'>
        {t('loading')}
      </div>
    );
  }

  const handleResetClick = () => {
    if (isResetConfirming) {
      window.umami?.track('settings_reset');
      resetSettings();
      clearCart();
      setIsResetConfirming(false);
    } else {
      setIsResetConfirming(true);
    }
  };

  return (
    <>
      <div
        className={`fixed left-0 top-0 h-full w-64 bg-white shadow-xl transform transition-transform duration-300 ease-in-out overflow-y-auto flex flex-col ${
          isToolsPanelOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className='flex-1 p-4 overflow-y-auto'>
          <h2 className='text-xl font-bold mb-3 text-gray-800'>Settings</h2>

          {/* Panel tabs */}
          <TabSelector activeTab={activeTab} setActiveTab={setActiveTab} />
          {activeTab === 'Demo' && (
            <>
              <DemoModeSwitcher locale={settings.language || 'en'} />
              <Link
                href={`/${settings.language || 'en'}/admin/cleanup-environment`}
                className='mt-4 block w-full rounded-md border border-gray-300 px-4 py-2 text-center text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50'
                onClick={() => toggleToolsPanel('isToolsPanelOpen')}
              >
                Admin: clean &amp; seed data
              </Link>
            </>
          )}
          {activeTab === 'Appearance' && <AppearanceTab />}
          {activeTab === 'Account' && (
            <AccountTab />
          )}

          <button
            onClick={handleResetClick}
            className={`w-full mt-4 py-2 px-6 rounded-md ${
              isResetConfirming
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-black hover:bg-black1'
            } text-white transition-colors duration-300`}
            onBlur={() => setIsResetConfirming(false)}
          >
            {isResetConfirming ? 'Confirm Reset' : 'Reset Settings'}
          </button>
        </div>

        {/* v1 Lora Banner - sticky to bottom of tools panel */}
        <div className='mt-auto'>
          <div className='flex items-center gap-x-6 bg-gray-900 px-4 py-2.5'>
            <p className='text-sm text-white'>
              <a
                href='http://lora.stripedemos.com/'
                target='_blank'
                rel='noopener noreferrer'
                className='hover:text-gray-200'
              >
                <svg
                  viewBox='0 0 2 2'
                  aria-hidden='true'
                  className='mx-2 inline size-0.5 fill-current'
                >
                  <circle r={1} cx={1} cy={1} />
                </svg>
                Access Lora v1&nbsp;
                <span aria-hidden='true'>&rarr;</span>
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Tools panel toggle button */}
      <button
        onClick={() => toggleToolsPanel('isToolsPanelOpen')}
        className='p-2 fixed left-0 bottom-16 bg-blurple transition-all duration-300 z-50 rounded-r-lg'
        aria-label={isToolsPanelOpen ? 'Close settings' : 'Open settings'}
      >
        {isToolsPanelOpen ? (
          <XMarkIcon className='h-8 w-8 text-white' />
        ) : (
          <img
            src='/img/icon/stripe.svg'
            alt='Stripe icon'
            width={32}
            height={32}
            className='opacity-60 hover:opacity-100 transition-opacity duration-300'
          />
        )}
      </button>
    </>
  );
}
