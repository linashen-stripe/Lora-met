'use client';

import { Suspense } from 'react';
import { LoadingOverlay } from '@/components';
import SubscribeMetronomePackageCheckoutView from '@/components/subscribe/SubscribeMetronomePackageCheckoutView';

export default function SubscribeMetronomePackagePage() {
  return (
    <div className='flex flex-col min-h-[calc(100vh-8rem)]'>
      <div className='flex-grow'>
        <Suspense fallback={<LoadingOverlay />}>
          <SubscribeMetronomePackageCheckoutView />
        </Suspense>
      </div>
    </div>
  );
}
