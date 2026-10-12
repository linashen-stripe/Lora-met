import Stripe from 'stripe';
import { subscribeToFreePlan } from '@/utils/stripe/subscriptions';

/**
 * Service for handling subscription cancellation workflows
 */
export class SubscriptionManagementService {
  constructor(private stripe: Stripe) {}

  /**
   * Cancel a subscription
   * @param params - Subscription cancellation parameters
   * @returns Cancellation result
   */
  async cancelSubscription(params: {
    customerId: string;
    pricingPlanSubscriptionId: string;
    billingCadenceId: string;
    enableAutomaticReenrollment: boolean;
  }) {
    const {
      customerId,
      pricingPlanSubscriptionId,
      billingCadenceId,
      enableAutomaticReenrollment,
    } = params;

    // Get the subscription to determine its currency
    const subscription =
      await this.stripe.v2.billing.pricingPlanSubscriptions.retrieve(
        pricingPlanSubscriptionId,
      );
    const plan = await this.stripe.v2.billing.pricingPlans.retrieve(
      subscription.pricing_plan,
    );
    const currency = plan.currency || 'usd';

    // Create billing intent for deactivation
    const billingIntent = await this.createDeactivationBillingIntent({
      cadenceId: billingCadenceId,
      pricingPlanSubscriptionId,
      currency: currency,
    });

    // Reserve and commit the billing intent
    await this.stripe.v2.billing.intents.reserve(billingIntent.id);
    await this.stripe.v2.billing.intents.commit(billingIntent.id);

    // Re-enroll in free plan if enabled
    if (enableAutomaticReenrollment) {
      const freePlanLookupKey = `llama_ai_free_plan_${currency}`;
      await subscribeToFreePlan(customerId, freePlanLookupKey);
    }

    return { success: true, billingIntentId: billingIntent.id };
  }

  /**
   * Create billing intent for subscription deactivation
   * @param params - Deactivation parameters
   * @returns Created billing intent
   */
  private async createDeactivationBillingIntent(params: {
    cadenceId: string;
    pricingPlanSubscriptionId: string;
    currency?: string;
  }) {
    const { cadenceId, pricingPlanSubscriptionId, currency = 'usd' } = params;

    return await this.stripe.v2.billing.intents.create({
      currency: currency,
      cadence: cadenceId,
      actions: [
        {
          type: 'deactivate',
          deactivate: {
            type: 'pricing_plan_subscription_details',
            pricing_plan_subscription_details: {
              pricing_plan_subscription: pricingPlanSubscriptionId,
            },
          },
        },
      ],
    });
  }

  /**
   * Advance test clock if customer has one (for development/testing)
   * @param customerId - Stripe customer ID
   */
  private async advanceTestClockIfNeeded(customerId: string) {
    try {
      const customer = await this.stripe.customers.retrieve(customerId);

      if (!customer.deleted && customer.test_clock) {
        const testClock = await this.stripe.testHelpers.testClocks.retrieve(
          customer.test_clock as string,
        );

        await this.stripe.testHelpers.testClocks.advance(testClock.id, {
          frozen_time: testClock.frozen_time + 3600, // Advance by 1 hour
        });
      }
    } catch (error) {
      // Ignore test clock errors in production
      console.warn('Test clock advancement failed:', error);
    }
  }
}
