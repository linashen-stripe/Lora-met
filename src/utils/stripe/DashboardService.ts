import Stripe from 'stripe';
import initializeStripe from '@/utils/stripe';
import { UnifiedDashboardData } from '@/utils/types';
import { CreditService } from './CreditService';
import { InvoiceService } from './InvoiceService';
import { SubscriptionService } from './SubscriptionService';
import {
  MeterService,
  PricingPlanComponent,
  RateCardRate,
} from './MeterService';

/**
 * Main dashboard service that orchestrates all dashboard data fetching
 * This replaces internal HTTP calls with direct service calls for better performance and maintainability
 */
export class DashboardService {
  private stripe: Stripe;
  private creditService: CreditService;
  private invoiceService: InvoiceService;
  private subscriptionService: SubscriptionService;
  private meterService: MeterService;

  constructor(headers: Headers) {
    this.stripe = initializeStripe(headers);
    this.creditService = new CreditService(this.stripe);
    this.invoiceService = new InvoiceService(this.stripe);
    this.subscriptionService = new SubscriptionService(this.stripe);
    this.meterService = new MeterService(this.stripe);
  }

  /**
   * Get all dashboard data - optimized for main dashboard (billing focus)
   * @param customerId - Stripe customer ID
   * @param includeUsageData - Whether to include full usage meter data (slower)
   * @returns Unified dashboard data
   */
  async getUnifiedDashboardData(
    customerId: string,
    includeUsageData = false,
  ): Promise<UnifiedDashboardData> {
    try {
      // Get subscription data (with or without component expansion based on usage needs)
      let subscriptionData;
      if (includeUsageData) {
        subscriptionData =
          await this.subscriptionService.getPricingPlanSubscription(customerId);
      } else {
        subscriptionData =
          await this.subscriptionService.getBasicPricingPlanSubscription(
            customerId,
          );
      }

      const billingCadenceId = subscriptionData.subscription.billing_cadence;
      const planId = subscriptionData.pricing_plan.id;

      if (!billingCadenceId || !planId) {
        throw new Error('Invalid subscription data');
      }

      // Fetch remaining dashboard data in parallel
      const [
        creditBalanceResult,
        previewInvoiceResult,
        billingCadenceResult,
        invoicesResult,
        autoTopUpResult,
      ] = await Promise.allSettled([
        this.creditService.getBalance(customerId),
        this.invoiceService.getPreview(billingCadenceId),
        this.subscriptionService.getBillingCadence(billingCadenceId),
        this.invoiceService.getCustomerInvoices(customerId),
        this.subscriptionService.getAutoTopUpStatus(customerId),
      ]);

      // Extract data from settled promises
      const extractData = (result: PromiseSettledResult<any>) =>
        result.status === 'fulfilled' ? result.value : null;

      const creditBalanceData = extractData(creditBalanceResult);
      const previewInvoice = extractData(previewInvoiceResult);
      const billingCadenceData = extractData(billingCadenceResult);
      const invoicesData = extractData(invoicesResult);
      const autoTopUpData = extractData(autoTopUpResult);

      // Get outstanding balance if preview invoice is available
      let outstandingBalanceData = null;
      if (previewInvoice) {
        try {
          outstandingBalanceData =
            await this.creditService.getOutstandingBalanceFromInvoice(
              previewInvoice,
              customerId,
            );
        } catch (error) {
          // Silently handle outstanding balance errors
        }
      }

      // Generate metered items based on data requirements
      let meteredItems;
      let metersData: any[] = [];

      if (includeUsageData) {
        // For usage page: use the original working approach
        metersData = await this.meterService.getMeters();
        meteredItems = this.meterService.generateMeteredItemsList(
          metersData || [],
          subscriptionData.expandedComponents as any[],
        );
      } else {
        // For main dashboard: extract from preview invoice (faster, billing-focused)
        meteredItems = this.extractMeteredItemsFromInvoice(previewInvoice);
      }

      return {
        creditBalance: creditBalanceData,
        billingCadence: billingCadenceData,
        pricingPlan: subscriptionData.pricing_plan,
        meteredItems,
        meters: metersData || [], // Include meters when usage data is requested
        invoices: invoicesData || [],
        previewInvoice: previewInvoice,
        autoTopUp: autoTopUpData?.enabled || false,
        outstandingBalance: outstandingBalanceData,
        subscription: {
          id: subscriptionData.subscription.id,
          status: subscriptionData.subscription.servicing_status,
          billingCadenceId,
          planId,
          customer: subscriptionData.subscription.customer,
        },
      };
    } catch (error) {
      console.error('Dashboard fetch failed:', error);
      throw error;
    }
  }

  /**
   * Extract metered items from preview invoice line items
   * @param invoice - Preview invoice
   * @returns Array of metered items
   */
  private extractMeteredItemsFromInvoice(invoice: any): any[] {
    if (!invoice?.lines?.data) {
      return [];
    }

    const meteredItems = invoice.lines.data
      .filter((line: any) => line.pricing?.rate_card_rate_details?.metered_item)
      .map((line: any) => {
        const meteredItemId = line.pricing.rate_card_rate_details.metered_item;
        const description = line.description || 'Unknown Item';

        // Infer meter_event_name from description for compatibility with Usage component
        let meter_event_name = 'unknown';
        if (
          description.toLowerCase().includes('image generation') ||
          description.toLowerCase().includes('basic image')
        ) {
          meter_event_name = 'image_generation';
        } else if (description.toLowerCase().includes('image enhancement')) {
          meter_event_name = 'image_enhancement';
        } else if (description.toLowerCase().includes('batch image')) {
          meter_event_name = 'batch_image_generation';
        } else if (
          description.toLowerCase().includes('ai model') ||
          description.toLowerCase().includes('model')
        ) {
          meter_event_name = 'ai_model_usage';
        }

        return {
          id: meteredItemId,
          display_name: description,
          meter: null, // We don't have actual meter IDs from invoice - usage page needs component expansion
          meter_event_name, // Inferred from description
          // Add rate card info for preview invoice compatibility
          rate_card_rate: line.pricing.rate_card_rate_details.rate_card_rate,
        };
      });

    // Remove duplicates by ID
    const uniqueMeteredItems = meteredItems.filter(
      (item: { id: string }, index: number, self: { id: string }[]) =>
        index === self.findIndex((t) => t.id === item.id),
    );

    return uniqueMeteredItems;
  }

  /**
   * Get credit service instance for direct use
   * @returns CreditService instance
   */
  getCreditService(): CreditService {
    return this.creditService;
  }

  /**
   * Get invoice service instance for direct use
   * @returns InvoiceService instance
   */
  getInvoiceService(): InvoiceService {
    return this.invoiceService;
  }

  /**
   * Get subscription service instance for direct use
   * @returns SubscriptionService instance
   */
  getSubscriptionService(): SubscriptionService {
    return this.subscriptionService;
  }

  /**
   * Get meter service instance for direct use
   * @returns MeterService instance
   */
  getMeterService(): MeterService {
    return this.meterService;
  }
}
