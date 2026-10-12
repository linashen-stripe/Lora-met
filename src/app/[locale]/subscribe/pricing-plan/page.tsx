'use client';

import { Suspense } from 'react';
import { LoadingOverlay } from '@/components';
import SubscribeMetronomePackageCheckoutView from '@/components/subscribe/SubscribeMetronomePackageCheckoutView';

/** Same Metronome embedded checkout as `/subscribe/metronome-package` (URL kept for existing links). */
export default function SubscribePricingPlanPage() {
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
