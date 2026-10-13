import { NextRequest, NextResponse } from 'next/server';
import { withFallbackHeaders } from '@/utils/withFallbackHeaders';
import { tracedServerFetch } from '@/utils/tracedServerFetch';

/**
 * Proxies Metronome POST /v1/contracts/customerBalances/getNetBalance
 * @see https://docs.metronome.com/api-reference/credits-and-commits/get-net-balance
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ metronomeCustomerId: string }> },
) {
  const apiKey = withFallbackHeaders(request.headers).metronomeApiKey;
  if (!apiKey) {
    return NextResponse.json({ data: null, error: 'Metronome not configured' }, { status: 503 });
  }

  try {
    const { metronomeCustomerId } = await params;
    const body = await request.json().catch(() => ({}));
    const {
      credit_type_id: creditTypeId,
      filters,
      invoice_inclusion_mode: invoiceInclusionMode,
    } = body as {
      credit_type_id?: string;
      filters?: unknown[];
      invoice_inclusion_mode?: 'FINALIZED' | 'FINALIZED_AND_DRAFT';
    };

    const payload: Record<string, unknown> = {
      customer_id: metronomeCustomerId,
      invoice_inclusion_mode: invoiceInclusionMode ?? 'FINALIZED_AND_DRAFT',
    };
    if (creditTypeId) payload.credit_type_id = creditTypeId;
    if (filters && Array.isArray(filters)) payload.filters = filters;

    const response = await tracedServerFetch(
      request.headers,
      'metronome',
      'https://api.metronome.com/v1/contracts/customerBalances/getNetBalance',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );

    const text = await response.text();
    if (!response.ok) {
      console.error('[net-balance] Metronome error:', response.status, text);
      return NextResponse.json(
        { error: `Metronome API error (${response.status})`, detail: text },
        { status: response.status },
      );
    }

    return NextResponse.json(JSON.parse(text));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to fetch net balance';
    console.error('[net-balance]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
