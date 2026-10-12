import Stripe from 'stripe';

/**
 * Service for handling all credit-related operations
 */
export class CreditService {
  constructor(private stripe: Stripe) {}

  /**
   * Get customer's currency from their subscription or customer data
   * @param customerId - Stripe customer ID
   * @returns Currency code (3-letter ISO)
   */
  private async getCustomerCurrency(customerId: string): Promise<string> {
    try {
      // Try to get currency from the customer's active subscription
      const subscriptions =
        await this.stripe.v2.billing.pricingPlanSubscriptions.list({
          payer: { type: 'customer', customer: customerId },
          limit: 1,
        });

      if (subscriptions.data && subscriptions.data.length > 0) {
        const subscription = subscriptions.data[0];
        if (typeof subscription.pricing_plan === 'string') {
          const plan = await this.stripe.v2.billing.pricingPlans.retrieve(
            subscription.pricing_plan,
          );
          if (plan.currency) {
            return plan.currency;
          }
        }
      }

      // Fallback: check customer metadata for auto top-up currency
      const customer = await this.stripe.customers.retrieve(customerId);
      if ((customer as any).metadata?.auto_top_up_currency) {
        return (customer as any).metadata.auto_top_up_currency;
      }

      // Final fallback
      return 'usd';
    } catch (error) {
      console.warn(
        `Could not determine customer currency for ${customerId}, defaulting to USD:`,
        error,
      );
      return 'usd';
    }
  }

  /**
   * Get customer's credit balance - works for all user types
   * @param customerId - Stripe customer ID
   * @param previewInvoice - Optional preview invoice for faster/more consistent data
   * @returns Credit balance information
   */
  async getBalance(customerId: string, previewInvoice?: Stripe.Invoice | null) {
    // First get all credit grants to know what we're working with
    const allGrants: Stripe.Billing.CreditGrant[] = [];
    for await (const grant of this.stripe.billing.creditGrants.list({
      customer: customerId,
    })) {
      allGrants.push(grant);
    }

    // If no grants, return zero values with customer currency
    if (allGrants.length === 0) {
      const customerCurrency = await this.getCustomerCurrency(customerId);
      return {
        total_available: 0,
        total_amount: 0,
        currency: customerCurrency,
      };
    }

    // Get balance summaries for each grant in parallel
    const balancePromises = allGrants.map((grant) =>
      this.stripe.billing.creditBalanceSummary.retrieve({
        customer: customerId,
        filter: {
          type: 'credit_grant',
          credit_grant: grant.id,
        },
      }),
    );

    const balanceSummaries = await Promise.allSettled(balancePromises);

    let totalAvailable = 0;
    let currency: string | null = null;

    // Sum up available balances from successful calls
    balanceSummaries.forEach((result) => {
      if (result.status === 'fulfilled' && result.value.balances) {
        result.value.balances.forEach((balance) => {
          if (
            balance.available_balance.type === 'monetary' &&
            balance.available_balance.monetary
          ) {
            const availableAmount = balance.available_balance.monetary.value;
            totalAvailable += availableAmount;

            if (!currency) {
              currency = balance.available_balance.monetary.currency;
            }
          }
        });
      }
    });

    // Use the more sophisticated logic for total_amount calculation
    // This includes current cycle subscription credits + purchased credits with balance +
    // purchased credits depleted in current cycle (prevents denominator from shrinking mid-cycle)
    // Pass allGrants to avoid re-fetching them
    const totalAmount = await this.calculateTotalCreditsDenominator(
      customerId,
      allGrants,
    );

    // Use detected currency or fallback to customer currency
    const finalCurrency =
      currency || (await this.getCustomerCurrency(customerId));

    return {
      total_available: totalAvailable,
      total_amount: totalAmount,
      currency: finalCurrency,
    };
  }

  /**
   * Calculate the total credits denominator for "X of Y credits remaining" display
   * Includes: current cycle subscription credits + purchased credits with balance +
   * purchased credits depleted in current cycle
   * @param customerId - Stripe customer ID
   * @param existingGrants - Optional pre-fetched credit grants to avoid re-fetching
   * @returns Total amount to show in denominator
   */
  async calculateTotalCreditsDenominator(
    customerId: string,
    existingGrants?: Stripe.Billing.CreditGrant[],
  ): Promise<number> {
    try {
      // Get billing cycle dates first
      const { cycleStart, cycleEnd } =
        await this.getBillingCycleDates(customerId);

      // Use existing grants if provided, otherwise fetch them
      let allGrants: Stripe.Billing.CreditGrant[];
      if (existingGrants && existingGrants.length > 0) {
        allGrants = existingGrants;
      } else {
        allGrants = [];
        for await (const grant of this.stripe.billing.creditGrants.list({
          customer: customerId,
        })) {
          allGrants.push(grant);
        }
      }

      if (allGrants.length === 0) {
        return 0;
      }

      // Filter out grants that haven't become effective yet (pending/future grants)
      // Stripe's V2 billing API pre-creates credit grants for future billing cycles
      // with effective_at dates in the future - these should not count towards the total
      const now = new Date();
      const effectiveGrants = allGrants.filter((grant) => {
        if (grant.effective_at) {
          const effectiveDate = new Date(grant.effective_at * 1000);
          return effectiveDate <= now;
        }
        return true; // Include grants without effective_at
      });

      if (effectiveGrants.length === 0) {
        return 0;
      }

      // Get balance summaries for each effective grant in parallel
      const balancePromises = effectiveGrants.map((grant) =>
        this.stripe.billing.creditBalanceSummary.retrieve({
          customer: customerId,
          filter: {
            type: 'credit_grant',
            credit_grant: grant.id,
          },
        }),
      );

      const balanceSummaries = await Promise.allSettled(balancePromises);
      let totalDenominator = 0;

      // Process each effective grant
      balanceSummaries.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.balances) {
          const grant = effectiveGrants[index];
          const grantAmount = grant.amount?.monetary?.value || 0;

          // Get available balance
          let availableBalance = 0;
          result.value.balances.forEach((balance) => {
            if (
              balance.available_balance.type === 'monetary' &&
              balance.available_balance.monetary
            ) {
              availableBalance += balance.available_balance.monetary.value;
            }
          });

          // Determine if this is a subscription credit vs purchased credit
          // Use multiple signals: category, name pattern, and priority
          const isSubscriptionCredit =
            grant.category === 'promotional' &&
            (grant.name?.includes('subscription') ||
              grant.name?.includes('plan') ||
              grant.name?.includes('monthly') ||
              // Welcome credits are one-time promotional, not subscription
              (grant.name !== 'Welcome Credits' && grant.priority !== 40));
          const grantCreatedAt = new Date(grant.created * 1000); // Stripe timestamps are in seconds
          const grantUpdatedAt = grant.updated
            ? new Date(grant.updated * 1000)
            : grantCreatedAt;

          if (isSubscriptionCredit) {
            // Include current cycle subscription credits
            if (grantCreatedAt >= cycleStart && grantCreatedAt <= cycleEnd) {
              totalDenominator += grantAmount;
            }
          } else {
            // Purchased credits logic
            if (availableBalance > 0) {
              // Include purchased credits with positive balance
              totalDenominator += grantAmount;
            } else {
              // Include purchased credits depleted in current cycle
              if (grantUpdatedAt >= cycleStart && grantUpdatedAt <= cycleEnd) {
                totalDenominator += grantAmount;
              }
            }
          }
        }
      });

      return totalDenominator;
    } catch (error) {
      console.error('Error calculating total credits denominator:', error);
      return 0;
    }
  }

  /**
   * Get current billing cycle dates for a customer
   * @param customerId - Stripe customer ID
   * @returns Object with cycle start and end dates
   */
  private async getBillingCycleDates(
    customerId: string,
  ): Promise<{ cycleStart: Date; cycleEnd: Date }> {
    try {
      // Get customer's pricing plan subscription
      const subscriptions =
        await this.stripe.v2.billing.pricingPlanSubscriptions.list({
          payer: { type: 'customer', customer: customerId },
        });

      if (!subscriptions.data || subscriptions.data.length === 0) {
        const now = new Date();
        return {
          cycleStart: new Date(now.getFullYear(), now.getMonth(), 1),
          cycleEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
        };
      }

      const subscription = subscriptions.data[0];
      const billingCadenceId = subscription.billing_cadence;

      if (!billingCadenceId) {
        throw new Error('No billing cadence found for subscription');
      }

      // Calculate current billing cycle based on subscription created date and billing frequency
      const subscriptionStart = new Date(
        typeof subscription.created === 'number'
          ? subscription.created * 1000
          : subscription.created,
      );
      const now = new Date();

      // For monthly billing, calculate current cycle
      const monthsSinceStart =
        (now.getFullYear() - subscriptionStart.getFullYear()) * 12 +
        (now.getMonth() - subscriptionStart.getMonth());

      const cycleStart = new Date(subscriptionStart);
      cycleStart.setMonth(subscriptionStart.getMonth() + monthsSinceStart);

      const cycleEnd = new Date(cycleStart);
      cycleEnd.setMonth(cycleStart.getMonth() + 1);
      cycleEnd.setSeconds(cycleEnd.getSeconds() - 1); // End of cycle

      return { cycleStart, cycleEnd };
    } catch (error) {
      console.error('Error getting billing cycle dates:', error);
      // Fallback to current month if billing cycle calculation fails
      const now = new Date();
      const cycleStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const cycleEnd = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
      );
      return { cycleStart, cycleEnd };
    }
  }

  /**
   * Get outstanding balance for usage-based charges only
   * @param customerId - Stripe customer ID
   * @returns Outstanding balance information
   */
  async getOutstandingBalance(customerId: string) {
    // Get customer's pricing plan subscription to find billing cadence
    const subscriptions =
      await this.stripe.v2.billing.pricingPlanSubscriptions.list({
        payer: { type: 'customer', customer: customerId },
      });

    if (!subscriptions.data || subscriptions.data.length === 0) {
      const customerCurrency = await this.getCustomerCurrency(customerId);
      return {
        outstanding_amount: 0,
        has_outstanding_debt: false,
        currency: customerCurrency,
      };
    }

    const pricingPlanSubscription = subscriptions.data[0];
    const billingCadenceId = pricingPlanSubscription.billing_cadence;

    if (!billingCadenceId) {
      const customerCurrency = await this.getCustomerCurrency(customerId);
      return {
        outstanding_amount: 0,
        has_outstanding_debt: false,
        currency: customerCurrency,
      };
    }

    // Get preview invoice to see outstanding amounts
    const invoice = await this.stripe.invoices.createPreview({
      billing_cadence: billingCadenceId,
    });

    // Filter invoice lines to only include rate card items (usage-based charges)
    const rateCardLines =
      invoice.lines?.data?.filter(
        (line: Stripe.InvoiceLineItem) => line.pricing?.rate_card_rate_details,
      ) || [];

    // Calculate the total amount for rate card items only
    const rateCardTotal = rateCardLines.reduce(
      (sum: number, line: Stripe.InvoiceLineItem) => sum + (line.amount || 0),
      0,
    );

    // Get total credits applied from rate card lines
    const rateCardCreditsApplied = rateCardLines.reduce(
      (sum: number, line: Stripe.InvoiceLineItem) => {
        const lineCredits =
          line.pretax_credit_amounts?.reduce(
            (lineSum: number, credit: { amount?: number }) =>
              lineSum + (credit.amount || 0),
            0,
          ) || 0;
        return sum + lineCredits;
      },
      0,
    );

    // Calculate outstanding amount for usage-based charges only
    const outstandingAmount = Math.max(
      0,
      rateCardTotal - rateCardCreditsApplied,
    );
    const hasOutstandingDebt = outstandingAmount > 0;

    return {
      outstanding_amount: outstandingAmount,
      has_outstanding_debt: hasOutstandingDebt,
      currency: invoice.currency || 'usd',
      invoice_details: {
        subtotal: invoice.subtotal,
        total: invoice.total,
        rate_card_total: rateCardTotal,
        rate_card_credits_applied: rateCardCreditsApplied,
        credits_applied: invoice.total_pretax_credit_amounts?.[0]?.amount || 0,
        usage_items: rateCardLines.map((line: Stripe.InvoiceLineItem) => ({
          description: line.description || '',
          quantity: line.quantity || 0,
          amount: line.amount,
          unit_price: line.pricing?.unit_amount_decimal
            ? parseInt(line.pricing.unit_amount_decimal)
            : 0,
          credits_applied:
            line.pretax_credit_amounts?.reduce(
              (sum: number, credit: { amount?: number }) =>
                sum + (credit.amount || 0),
              0,
            ) || 0,
        })),
      },
    };
  }

  /**
   * Get outstanding balance using a pre-fetched invoice to avoid duplicate API calls
   * @param previewInvoice - Pre-fetched preview invoice
   * @returns Outstanding balance information
   */
  async getOutstandingBalanceFromInvoice(
    previewInvoice: Stripe.Invoice | null,
    customerId?: string,
  ) {
    if (!previewInvoice) {
      // If customerId is provided, use it to get proper currency
      const currency = customerId
        ? await this.getCustomerCurrency(customerId)
        : 'usd';
      return {
        outstanding_amount: 0,
        has_outstanding_debt: false,
        currency: currency,
      };
    }

    // Filter invoice lines to only include rate card items (usage-based charges)
    const rateCardLines =
      previewInvoice.lines?.data?.filter(
        (line: Stripe.InvoiceLineItem) => line.pricing?.rate_card_rate_details,
      ) || [];

    // Calculate the total amount for rate card items only
    const rateCardTotal = rateCardLines.reduce(
      (sum: number, line: Stripe.InvoiceLineItem) => sum + (line.amount || 0),
      0,
    );

    // Get total credits applied from rate card lines
    const rateCardCreditsApplied = rateCardLines.reduce(
      (sum: number, line: Stripe.InvoiceLineItem) => {
        const lineCredits =
          line.pretax_credit_amounts?.reduce(
            (lineSum: number, credit: { amount?: number }) =>
              lineSum + (credit.amount || 0),
            0,
          ) || 0;
        return sum + lineCredits;
      },
      0,
    );

    // Calculate outstanding amount for usage-based charges only
    const outstandingAmount = Math.max(
      0,
      rateCardTotal - rateCardCreditsApplied,
    );
    const hasOutstandingDebt = outstandingAmount > 0;

    // Use invoice currency or fallback to customer currency if customerId provided
    const currency =
      previewInvoice.currency ||
      (customerId ? await this.getCustomerCurrency(customerId) : 'usd');

    return {
      outstanding_amount: outstandingAmount,
      has_outstanding_debt: hasOutstandingDebt,
      currency: currency,
      invoice_details: {
        subtotal: previewInvoice.subtotal,
        total: previewInvoice.total,
        rate_card_total: rateCardTotal,
        rate_card_credits_applied: rateCardCreditsApplied,
        credits_applied:
          previewInvoice.total_pretax_credit_amounts?.[0]?.amount || 0,
        usage_items: rateCardLines.map((line: Stripe.InvoiceLineItem) => ({
          description: line.description || '',
          quantity: line.quantity || 0,
          amount: line.amount,
          unit_price: line.pricing?.unit_amount_decimal
            ? parseInt(line.pricing.unit_amount_decimal)
            : 0,
          credits_applied:
            line.pretax_credit_amounts?.reduce(
              (sum: number, credit: { amount?: number }) =>
                sum + (credit.amount || 0),
              0,
            ) || 0,
        })),
      },
    };
  }
}
