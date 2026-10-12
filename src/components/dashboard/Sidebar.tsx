'use client';

import React from 'react';
import { useTranslation } from 'next-i18next';
import { useConfigContext } from '@/contexts/ConfigContext';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const Sidebar = () => {
  const { t } = useTranslation();
  const { settings, demoMode } = useConfigContext();
  const pathname = usePathname();

  const lang = settings?.language || 'en';
  const dashboardBase = `/${lang}/dashboard`;

  const isBillingActive = pathname === dashboardBase;
  const isUsageActive = pathname === `${dashboardBase}/usage`;
  const isSettingsActive = pathname === `${dashboardBase}/settings`;

  return (
    <div className='w-48'>
      <nav>
        <ul className='space-y-1'>
          <li>
            <Link
              href={`${dashboardBase}?demoMode=${demoMode}`}
              className={`block px-4 py-2 rounded-md ${
                isBillingActive
                  ? 'bg-white text-gray-900 font-medium'
                  : 'text-text-color'
              }`}
            >
              {t('dashboard.sidebar.billing')}
            </Link>
          </li>
          <li>
            <Link
              href={`${dashboardBase}/usage?demoMode=${demoMode}`}
              className={`block px-4 py-2 rounded-md ${
                isUsageActive
                  ? 'bg-white text-gray-900 font-medium'
                  : 'text-text-color'
              }`}
            >
              {t('dashboard.sidebar.usage')}
            </Link>
          </li>
          <li>
            <Link
              href={`${dashboardBase}/settings?demoMode=${demoMode}`}
              className={`block px-4 py-2 rounded-md ${
                isSettingsActive
                  ? 'bg-white text-gray-900 font-medium'
                  : 'text-text-color'
              }`}
            >
              {t('dashboard.sidebar.settings')}
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
};

export default Sidebar;
