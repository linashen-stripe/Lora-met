import Stripe from 'stripe';
import initializeStripe from '@/utils/stripe';
import { getOrCreateBillingProfile } from '@/utils/stripe/billingProfile';
import { getOrCreateCadence } from '@/utils/stripe/cadence';

export async function subscribeToFreePlan(
  customerId: string,
  planLookupKey: string,
  currency: string = 'usd',
) {
  const stripe = initializeStripe(new Headers());
  console.log(`Subscribing customer ${customerId} to free plan.`);

  const freePlanResponse = await stripe.v2.billing.pricingPlans.list({
    lookup_keys: [planLookupKey],
  });

  if (freePlanResponse.data.length === 0) {
    throw new Error(
      `"${planLookupKey}" not found. Please run the setup script first.`,
    );
  }

  const freePlan = freePlanResponse.data[0];

  if (!freePlan.live_version) {
    throw new Error('Free plan does not have a live version.');
  }

  const billingProfile = await getOrCreateBillingProfile(stripe, customerId);
  const cadence = await getOrCreateCadence(stripe, customerId, billingProfile.id);
  console.log(`✅ Cadence: ${cadence.id}`);

  // Create a billing intent to subscribe to the plan
  const intent = await stripe.v2.billing.intents.create({
    currency: currency,
    cadence: cadence.id,
    actions: [
      {
        type: 'subscribe',
        subscribe: {
          type: 'pricing_plan_subscription_details',
          pricing_plan_subscription_details: {
            pricing_plan: freePlan.id,
            pricing_plan_version: freePlan.live_version,
            component_configurations: [],
          },
        },
      },
    ],
  });
  console.log(`✅ Billing Intent drafted: ${intent.id}`);

  // Reserve and commit the intent to finalize the subscription
  await stripe.v2.billing.intents.reserve(intent.id);
  await stripe.v2.billing.intents.commit(intent.id);
  console.log(`✅ Billing Intent committed: ${intent.id}`);

  // Fetch the new subscription to confirm
  const subscriptions = await stripe.v2.billing.pricingPlanSubscriptions.list({
    payer: { type: 'customer', customer: customerId },
    limit: 1,
  });
  if (!subscriptions.data || subscriptions.data.length === 0) {
    throw new Error('No subscription found after commitment');
  }
  const subscriptionId = subscriptions.data[0].id;
  console.log(`✅ Found subscription: ${subscriptionId}`);

  return subscriptionId;
}

export async function grantWelcomeCredits(
  stripe: Stripe,
  customerId: string,
  currency: string = 'usd',
) {
  console.log(
    `Granting 5 ${currency.toUpperCase()} welcome credits to customer ${customerId}`,
  );

  const creditGrant = await stripe.billing.creditGrants.create({
    name: 'Welcome Credits',
    customer: customerId,
    amount: {
      monetary: {
        currency: currency.toLowerCase(),
        value: 500,
      },
      type: 'monetary',
    },
    applicability_config: {
      scope: {
        price_type: 'metered',
      },
    },
    category: 'promotional',
    priority: 40, // Higher priority than paid credits and premium
  });

  console.log(`✅ Credits granted: ${creditGrant.id}`);
  return creditGrant;
}

export async function getSubscriptionAndPlan(customerId: string) {
  const stripe = initializeStripe(new Headers());
  const subscriptions = await stripe.v2.billing.pricingPlanSubscriptions.list({
    payer: { type: 'customer', customer: customerId },
    limit: 1,
  });

  if (subscriptions.data.length === 0) {
    return { subscription: null, plan: null };
  }

  const subscription = subscriptions.data[0];
  const plan = await stripe.v2.billing.pricingPlans.retrieve(
    subscription.pricing_plan,
  );

  return { subscription, plan };
}
