'use client';

import Stripe from 'stripe';
import useTestClock from '@/components/hooks/useTestClock';
import AdvanceTestClock from '@/components/dashboard/simulations/AdvanceTestClock';
import SendMeterUsage from '@/components/dashboard/simulations/SendMeterUsage';
import SimulateMultiCycle from '@/components/dashboard/simulations/SimulateMultiCycle';

export default function UserSimulations({
  meteredItems,
  billingCadence,
}: {
  meteredItems: any[];
  billingCadence: Stripe.V2.Billing.Cadence;
}) {
  const testClock = useTestClock();

  return (
    <div className='py-6 space-y-8'>
      {/* Scenario 1: Test Clock */}
      <AdvanceTestClock testClock={testClock} />

      {/* Scenario 2: Send Usage to Meters */}
      <SendMeterUsage testClock={testClock} meteredItems={meteredItems} />

      {/* Scenario 3: Simulate Multi-Cycle */}
      <SimulateMultiCycle
        testClock={testClock}
        meteredItems={meteredItems}
        billingCadence={billingCadence}
      />
    </div>
  );
}
