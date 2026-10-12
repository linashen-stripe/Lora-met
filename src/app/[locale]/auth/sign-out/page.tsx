'use client';

import { LoadingOverlay } from '@/components';
import { useConfigContext } from '@/contexts/ConfigContext';
import { generateRandomCustomerEmail } from '@/utils/helpers';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

export default function SignUp() {
  const router = useRouter();
  const { settings, updateCustomer, updatePlan, updateSubscription } =
    useConfigContext();
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    // Clear customer data
    updateCustomer({
      id: undefined,
      testClockId: undefined,
      email: generateRandomCustomerEmail(),
      activeSubscription: false, // Clear the subscription flag that locks UI elements
    });

    // Clear plan and subscription data
    updatePlan({ id: undefined, lookupKey: undefined, displayName: undefined });
    updateSubscription({
      id: undefined,
      status: undefined,
      billingCadenceId: undefined,
    });

    // Clear chat demo state
    localStorage.removeItem('savory-seasons-chat-state-new');

    // Redirect with fallback
    const language = settings?.language || 'en';
    router.push(`/${language}`);
  }, [
    router,
    settings?.language,
    updateCustomer,
    updatePlan,
    updateSubscription,
  ]);

  return (
    <div className='min-h-screen bg-background flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8'>
      <LoadingOverlay />
    </div>
  );
}
