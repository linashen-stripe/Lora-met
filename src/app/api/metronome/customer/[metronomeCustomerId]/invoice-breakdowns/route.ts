import { NextRequest, NextResponse } from 'next/server';
import { withFallbackHeaders } from '@/utils/withFallbackHeaders';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ metronomeCustomerId: string }> },
) {
  const apiKey = withFallbackHeaders(request.headers).metronomeApiKey;
  if (!apiKey) {
    return NextResponse.json({ data: [], next_page: null });
  }

  try {
    const { metronomeCustomerId } = await params;
    const { searchParams } = new URL(request.url);

    const startingOn   = searchParams.get('starting_on');
    const endingBefore = searchParams.get('ending_before');
    const windowSize   = searchParams.get('window_size') ?? 'day';
    const status       = searchParams.get('status') ?? undefined;

    if (!startingOn || !endingBefore) {
      return NextResponse.json(
        { error: 'starting_on and ending_before are required' },
        { status: 400 },
      );
    }

    const allData: any[] = [];
    let nextPage: string | null = null;

    do {
      const url = new URL(
        `https://api.metronome.com/v1/customers/${metronomeCustomerId}/invoices/breakdowns`,
      );
      url.searchParams.set('starting_on', startingOn);
      url.searchParams.set('ending_before', endingBefore);
      url.searchParams.set('window_size', windowSize);
      url.searchParams.set('skip_zero_qty_line_items', 'true');
      if (status) url.searchParams.set('status', status);
      if (nextPage) url.searchParams.set('next_page', nextPage);

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[invoice-breakdowns] Metronome ${response.status}:`, errText);
        return NextResponse.json(
          { error: `Metronome API error (${response.status})`, detail: errText },
          { status: response.status },
        );
      }

      const result = await response.json();
      allData.push(...(result.data ?? []));
      nextPage = result.next_page ?? null;
    } while (nextPage);

    return NextResponse.json({ data: allData });
  } catch (error: any) {
    console.error('[invoice-breakdowns] error:', error?.message);
    return NextResponse.json({ error: error?.message ?? 'Failed to fetch invoice breakdowns' }, { status: 500 });
  }
}
