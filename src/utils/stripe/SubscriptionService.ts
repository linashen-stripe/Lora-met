import Stripe from 'stripe';
import { CUSTOMER_METADATA_KEYS } from '@/utils/constants';

/**
 * Service for handling subscription-related operations
 */
export class SubscriptionService {
  // Static cache shared across all instances
  private static pricingPlanCache: Map<
    string,
    { data: any; timestamp: number }
  > = new Map();
  private readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  constructor(private stripe: Stripe) {}

  /**
   * Get cached pricing plan or fetch from Stripe if not cached/expired
   * @param pricingPlanId - Pricing plan ID
   * @returns Pricing plan data
   */
  private async getCachedPricingPlan(pricingPlanId: string): Promise<any> {
    const now = Date.now();
    const cached = SubscriptionService.pricingPlanCache.get(pricingPlanId);

    // Return cached data if it exists and hasn't expired
    if (cached && now - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    // Fetch from Stripe and cache the result
    const pricingPlan =
      await this.stripe.v2.billing.pricingPlans.retrieve(pricingPlanId);

    SubscriptionService.pricingPlanCache.set(pricingPlanId, {
      data: pricingPlan,
      timestamp: now,
    });
    return pricingPlan;
  }

  /**
   * Get customer's pricing plan subscription data
   * @param customerId - Stripe customer ID
   * @returns Subscription data with pricing plan info
   */
  async getPricingPlanSubscription(customerId: string) {
    const subscriptions =
      await this.stripe.v2.billing.pricingPlanSubscriptions.list({
        payer: { type: 'customer', customer: customerId },
        servicing_status: 'active',
      });

    if (!subscriptions.data || subscriptions.data.length === 0) {
      throw new Error('No pricing plan subscription found');
    }

    // Sort subscriptions by created date (descending)
    const sortedSubscriptions = subscriptions.data.sort(
      (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime(),
    );

    /**
     * Pick the most recently created subscription.  In the case the user
     * upgraded, we may see multiple subscriptions until the previous subscription
     * is cancelled by the webhook asynchronously.
     */
    const subscription = sortedSubscriptions[0];

    // Get pricing plan details with caching
    const pricingPlan = await this.getCachedPricingPlan(
      subscription.pricing_plan,
    );

    // Get expanded components using parallel API calls for better performance
    let expandedComponents: unknown[] = [];
    try {
      // Find associated components
      const componentList =
        await this.stripe.v2.billing.pricingPlans.components.list(
          pricingPlan.id,
        );

      // Collect all API calls that need to be made for component expansion
      const expansionCalls: Promise<any>[] = [];
      const expansionMetadata: Array<{
        componentIndex: number;
        type: 'rate_card' | 'license_fee' | 'service_action';
        id: string;
      }> = [];

      // Build list of all expansion API calls
      componentList.data.forEach((component, index) => {
        if (component.type === 'rate_card' && component.rate_card) {
          expansionCalls.push(
            this.stripe.v2.billing.rateCards.rates.list(component.rate_card.id),
          );
          expansionMetadata.push({
            componentIndex: index,
            type: 'rate_card',
            id: component.rate_card.id,
          });
        } else if (component.type === 'license_fee' && component.license_fee) {
          expansionCalls.push(
            this.stripe.v2.billing.licenseFees.retrieve(
              component.license_fee.id,
            ),
          );
          expansionMetadata.push({
            componentIndex: index,
            type: 'license_fee',
            id: component.license_fee.id,
          });
        } else if (
          component.type === 'service_action' &&
          component.service_action
        ) {
          expansionCalls.push(
            this.stripe.v2.billing.serviceActions.retrieve(
              component.service_action.id,
            ),
          );
          expansionMetadata.push({
            componentIndex: index,
            type: 'service_action',
            id: component.service_action.id,
          });
        }
      });

      // Execute all expansion calls in parallel
      const expansionResults = await Promise.allSettled(expansionCalls);

      // Build expanded components array with results
      expandedComponents = componentList.data.map((component, index) => {
        // Find expansion result for this component
        const metadataIndex = expansionMetadata.findIndex(
          (meta) => meta.componentIndex === index,
        );

        if (metadataIndex >= 0) {
          const result = expansionResults[metadataIndex];
          const metadata = expansionMetadata[metadataIndex];

          if (result.status === 'fulfilled') {
            switch (metadata.type) {
              case 'rate_card':
                return {
                  ...component,
                  expanded_rate_card_rates: result.value.data,
                };
              case 'license_fee':
                return {
                  ...component,
                  expanded_license_fee: result.value,
                };
              case 'service_action':
                return {
                  ...component,
                  expanded_service_action: result.value,
                };
            }
          } else {
            console.warn(
              `Failed to expand ${metadata.type} with ID ${metadata.id}:`,
              result.reason,
            );
          }
        }

        return component;
      });
    } catch (error) {
      console.error('Error fetching pricing plan components:', error);
    }

    // Fetch customer data with payment method for dashboard payment method display
    let customer = null;
    try {
      const customerData = await this.stripe.customers.retrieve(customerId, {
        expand: ['invoice_settings.default_payment_method'],
      });
      customer = customerData;
    } catch (error) {
      console.warn('Could not fetch customer payment method data:', error);
    }

    return {
      subscription: {
        id: subscription.id,
        servicing_status: subscription.servicing_status,
        billing_cadence: subscription.billing_cadence,
        customer: customer,
      },
      pricing_plan: {
        id: pricingPlan.id,
        display_name: pricingPlan.display_name,
        lookup_key: pricingPlan.lookup_key || '',
        currency: pricingPlan.currency || 'usd',
        live_version: pricingPlan.latest_version,
        components: {
          license_fee: {
            id: 'license_fee',
            unit_price: 0,
          },
        },
        expandedComponents,
      },
      expandedComponents,
    };
  }

  /**
   * Get customer's basic pricing plan subscription data (WITHOUT expensive component expansion)
   * @param customerId - Stripe customer ID
   * @returns Basic subscription data with pricing plan info (no expanded components)
   */
  async getBasicPricingPlanSubscription(customerId: string) {
    const subscriptions =
      await this.stripe.v2.billing.pricingPlanSubscriptions.list({
        payer: { type: 'customer', customer: customerId },
        servicing_status: 'active',
      });

    if (!subscriptions.data || subscriptions.data.length === 0) {
      throw new Error('No pricing plan subscription found');
    }

    // Sort subscriptions by created date (descending)
    const sortedSubscriptions = subscriptions.data.sort(
      (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime(),
    );

    const subscription = sortedSubscriptions[0];

    // Get basic pricing plan details (cached, but no component expansion)
    const pricingPlan = await this.getCachedPricingPlan(
      subscription.pricing_plan,
    );

    // Fetch customer data with payment method for dashboard payment method display
    let customer = null;
    try {
      const customerData = await this.stripe.customers.retrieve(customerId, {
        expand: ['invoice_settings.default_payment_method'],
      });
      customer = customerData;
    } catch (error) {
      console.warn('Could not fetch customer payment method data:', error);
    }

    return {
      subscription: {
        id: subscription.id,
        servicing_status: subscription.servicing_status,
        billing_cadence: subscription.billing_cadence,
        customer: customer,
      },
      pricing_plan: {
        id: pricingPlan.id,
        display_name: pricingPlan.display_name,
        lookup_key: pricingPlan.lookup_key || '',
        currency: pricingPlan.currency || 'usd',
        live_version: pricingPlan.latest_version,
        components: {
          license_fee: {
            id: 'license_fee',
            unit_price: 0,
          },
        },
      },
      expandedComponents: [],
    };
  }

  /**
   * Get billing cadence information
   * @param billingCadenceId - Billing cadence ID
   * @returns Billing cadence data
   */
  async getBillingCadence(billingCadenceId: string) {
    return await this.stripe.v2.billing.cadences.retrieve(billingCadenceId);
  }

  /**
   * Get auto top-up status for a customer
   * @param customerId - Stripe customer ID
   * @returns Auto top-up status
   */
  async getAutoTopUpStatus(customerId: string): Promise<{ enabled: boolean }> {
    try {
      // Check if customer has any active auto top-up configuration
      // This is a simplified implementation - adjust based on your actual auto top-up logic
      const customer = (await this.stripe.customers.retrieve(
        customerId,
      )) as Stripe.Customer;

      // Check metadata for auto top-up status using the correct key
      const autoTopUpEnabled =
        customer.metadata?.[CUSTOMER_METADATA_KEYS.AUTO_TOP_UP_ENABLED] ===
          'true' || false;

      return { enabled: autoTopUpEnabled };
    } catch (error) {
      console.warn('Could not fetch auto top-up status:', error);
      return { enabled: false };
    }
  }
}
