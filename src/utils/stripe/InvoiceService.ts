import Stripe from 'stripe';

/**
 * Service for handling all invoice-related operations
 */
export class InvoiceService {
  constructor(private stripe: Stripe) {}

  /**
   * Get preview invoice for a billing cadence
   * @param billingCadenceId - Billing cadence ID
   * @returns Preview invoice or null if no upcoming invoice
   */
  async getPreview(billingCadenceId: string): Promise<Stripe.Invoice | null> {
    try {
      const invoice = await this.stripe.invoices.createPreview({
        billing_cadence: billingCadenceId,
      });

      // If there are more line items beyond the first page, fetch them all
      if (invoice.lines.has_more && invoice.id) {
        const allLineItems = [...invoice.lines.data];
        let hasMore = true;
        let lastItemId = invoice.lines.data[invoice.lines.data.length - 1]?.id;

        while (hasMore && lastItemId) {
          const additionalLines = await this.stripe.invoices.listLineItems(
            invoice.id,
            {
              starting_after: lastItemId,
              limit: 50,
            },
          );

          allLineItems.push(...additionalLines.data);
          hasMore = additionalLines.has_more;

          if (additionalLines.data.length > 0) {
            const lastItem =
              additionalLines.data[additionalLines.data.length - 1];
            lastItemId = lastItem?.id;
          } else {
            break; // No more items to fetch
          }
        }

        // Update the invoice with all line items
        (invoice.lines as any).data = allLineItems;
        (invoice.lines as any).has_more = false;
      }

      return invoice;
    } catch (error: unknown) {
      // Handle common cases where preview invoice is not available
      const stripeError = error as Stripe.StripeRawError;
      if (
        stripeError.message?.includes('No upcoming invoices') ||
        stripeError.code === 'invoice_upcoming_none' ||
        stripeError.type === 'invalid_request_error'
      ) {
        console.log(
          `No upcoming invoice for billing cadence ${billingCadenceId} - this is normal for free plans or customers with no usage`,
        );
        return null;
      }

      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Get customer's invoices (excludes draft invoices)
   * @param customerId - Stripe customer ID
   * @param limit - Number of invoices to retrieve
   * @returns List of customer invoices (non-draft only)
   */
  async getCustomerInvoices(
    customerId: string,
    limit: number = 10,
  ): Promise<Stripe.Invoice[]> {
    const invoices = await this.stripe.invoices.list({
      customer: customerId,
      limit,
    });

    // Filter out draft invoices - only return finalized invoices
    return invoices.data.filter((invoice) => invoice.status !== 'draft');
  }
}
