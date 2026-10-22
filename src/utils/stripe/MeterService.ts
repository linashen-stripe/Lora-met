import Stripe from 'stripe';
import { STRIPE_API_VERSION } from '@/utils/stripe';

export interface UsageRecord {
  eventName: string;
  timestamp?: string;
  amount: number;
  meter_segment_conditions?: { dimension: string; value: string }[];
}

/**
 * Service for handling meter and metered item operations
 */
export class MeterService {
  constructor(private stripe: Stripe) {}

  /**
   * Get all meters
   * @returns List of meters
   */
  async getMeters(meterIds?: string[]): Promise<Stripe.Billing.Meter[]> {
    if (meterIds && meterIds.length > 0) {
      const meterPromises = meterIds.map((id) =>
        this.stripe.billing.meters.retrieve(id),
      );
      return Promise.all(meterPromises);
    }
    const meters = await this.stripe.billing.meters.list({
      status: 'active',
    });
    return meters.data;
  }

  /**
   * Get meter usage for a customer across multiple meters
   * @param params - Meter usage parameters
   * @returns Meter usage data
   */
  async getMeterUsage(params: {
    customer: string;
    start_time: number;
    end_time: number;
    meters: Array<{
      meter_id: string;
      dimension_group_by_keys?: string[];
    }>;
    value_grouping_window?: Stripe.Billing.Analytics.MeterUsageRetrieveParams.ValueGroupingWindow;
  }): Promise<Stripe.Response<Stripe.Billing.Analytics.MeterUsage>> {
    const { customer, start_time, end_time, meters, value_grouping_window } =
      params;

    const meterUsage = await this.stripe.billing.analytics.meterUsage.retrieve({
      customer,
      starts_at: start_time,
      ends_at: end_time,
      meters: meters.map((m) => ({
        meter: m.meter_id,
        dimension_group_by_keys: m.dimension_group_by_keys,
      })),
      ...(value_grouping_window && { value_grouping_window }),
    });

    return meterUsage;
  }

  /**
   * Send bulk meter events for a customer
   * @param customerId - Customer ID
   * @param data - Array of usage records
   * @param useStreaming - Whether to use streaming for high throughput
   * @returns Success status
   */
  async sendBulkMeterEvents(
    customerId: string,
    data: UsageRecord[],
    useStreaming = false,
  ): Promise<void> {
    if (useStreaming) {
      await this.sendAsyncMeterEvents(customerId, data);
    } else {
      await this.sendMeterEvents(customerId, data);
    }
  }

  /**
   * Create meter event payload from usage record
   * @param customerId - Customer ID
   * @param item - Usage record
   * @returns Meter event payload
   */
  private createMeterEventPayload(customerId: string, item: UsageRecord) {
    return {
      event_name: item.eventName,
      // If timestamp is provided, use it, otherwise use server default which should be current test clock time
      ...(item.timestamp ? { timestamp: item.timestamp } : {}),
      payload: {
        value: item.amount.toString(),
        stripe_customer_id: customerId,
        ...(item.meter_segment_conditions?.reduce(
          (
            acc: Record<string, string>,
            entry: { dimension: string; value: string },
          ) => {
            acc[entry.dimension] = entry.value;
            return acc;
          },
          {},
        ) || {}),
      },
    };
  }

  /**
   * Send meter events synchronously
   * @param customerId - Customer ID
   * @param data - Usage records
   */
  private async sendMeterEvents(
    customerId: string,
    data: UsageRecord[],
  ): Promise<void> {
    // Create a new meter event for each item in the data array
    await Promise.all(
      data.map((item) => {
        return this.stripe.v2.billing.meterEvents.create(
          this.createMeterEventPayload(customerId, item),
        );
      }),
    );
  }

  /**
   * Send meter events asynchronously via streams for larger payloads
   * @param customerId - Customer ID
   * @param data - Usage records
   */
  private async sendAsyncMeterEvents(
    customerId: string,
    data: UsageRecord[],
  ): Promise<void> {
    // Create a new meter event session for higher throughput of meter events
    const meterEventSession =
      await this.stripe.v2.billing.meterEventSession.create();

    // Create a new stripe instance with the session authentication token
    const stripeWithSession = new Stripe(
      meterEventSession.authentication_token,
      { apiVersion: STRIPE_API_VERSION },
    );

    // Create a new meter event stream for the meter events
    await stripeWithSession.v2.billing.meterEventStream.create({
      events: data.map((item) =>
        this.createMeterEventPayload(customerId, item),
      ),
    });
  }
}
