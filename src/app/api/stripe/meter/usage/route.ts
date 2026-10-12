import { NextRequest, NextResponse } from 'next/server';
import initializeStripe from '@/utils/stripe';
import { MeterService } from '@/utils/stripe/MeterService';
import Stripe from 'stripe';

interface RequestBody {
  customer: string;
  start_time: number;
  end_time: number;
  meters: Array<{
    meter_id: string;
    dimension_group_by_keys?: string[];
  }>;
  value_grouping_window?: Stripe.Billing.Analytics.MeterUsageRetrieveParams.ValueGroupingWindow;
}

/**
 * Retrieve meter usage
 * @param request - NextRequest object
 * @param params - Object containing the meter ID
 * @returns List of meter event summaries
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const stripe = initializeStripe(request.headers);
    const meterService = new MeterService(stripe);

    const {
      customer,
      start_time,
      end_time,
      meters,
      value_grouping_window,
    }: RequestBody = await request.json();

    const meterUsage = await meterService.getMeterUsage({
      customer,
      start_time,
      end_time,
      meters,
      value_grouping_window,
    });

    const rows = meterUsage.rows?.data ?? [];
    const normalizedRows = rows.map((row) => ({
      ...row,
      meter_id: row.meter ?? (row as { meter_id?: string }).meter_id,
      bucket_value:
        row.value ?? (row as { bucket_value?: number }).bucket_value,
    }));

    return NextResponse.json({
      ...meterUsage,
      rows: { ...meterUsage.rows, data: normalizedRows },
      data: normalizedRows,
    });
  } catch (error: any) {
    console.error('Error fetching meter event summaries:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
