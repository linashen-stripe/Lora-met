'use client';

import SubscriptionDetails from './cards/SubscriptionDetails';
import ErrorBanner from '../ui/ErrorBanner';
import PaymentMethod from './cards/PaymentMethod';
import Invoices from './cards/Invoices';
import PurchaseCreditsCard from './cards/PurchaseCredits';
import Cancel from './cards/Cancel';
import SubscriptionUsage from './cards/SubscriptionUsage';

const Billing = ({ type, subscription, message, plan, pricing_plan }: any) => {
  return (
    <div className='space-y-6 w-full'>
      {message && <ErrorBanner message={message} />}
      {subscription && (
        <>
          <SubscriptionDetails
            subscription={subscription}
            pricing_plan={pricing_plan}
          />
          <SubscriptionUsage subscription={subscription} plan={plan} />
          <PurchaseCreditsCard subscription={subscription} />
          <PaymentMethod subscription={subscription} />
          <Invoices subscription={subscription} />
          <Cancel
            subscription={subscription}
            type={type === 'pricing-plan' ? 'pricing-plan' : 'subscription'}
          />
        </>
      )}
    </div>
  );
};

export default Billing;
