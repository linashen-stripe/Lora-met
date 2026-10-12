'use client';

import React from 'react';
import { useTranslation } from 'next-i18next';
import { useConfigContext } from '@/contexts/ConfigContext';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const Sidebar = () => {
  const { t } = useTranslation();
  const { settings } = useConfigContext();
  const pathname = usePathname();

  const usagePath = `/${settings?.language || 'en'}/settings/usage`;
  const isUsageActive = pathname === usagePath;

  const isBillingActive =
    !isUsageActive &&
    pathname.startsWith(`/${settings?.language || 'en'}/settings`);

  return (
    <div className='w-48'>
      <nav>
        <ul className='space-y-1'>
          <li>
            <Link
              href={`/${settings?.language || 'en'}/settings`}
              className={`block px-4 py-2 rounded-md ${
                isBillingActive
                  ? 'bg-white text-gray-900 font-medium'
                  : 'text-text-color'
              }`}
            >
              {t('settings.sidebar.billing')}
            </Link>
          </li>
          <li>
            <Link
              href={`/${settings?.language || 'en'}/settings/usage`}
              className={`block px-4 py-2 rounded-md ${
                isUsageActive
                  ? 'bg-white text-gray-900 font-medium'
                  : 'text-text-color'
              }`}
            >
              Usage Metrics
            </Link>
          </li>
          <li>
            <a
              href='#'
              className='block px-4 py-2 rounded-md text-text-color cursor-default'
            >
              {t('settings.sidebar.profile')}
            </a>
          </li>
          <li>
            <a
              href='#'
              className='block px-4 py-2 rounded-md text-text-color cursor-default'
            >
              {t('settings.sidebar.account')}
            </a>
          </li>
        </ul>
      </nav>
    </div>
  );
};

export default Sidebar;
