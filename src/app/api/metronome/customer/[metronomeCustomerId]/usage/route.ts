import { NextRequest, NextResponse } from 'next/server';
import { withFallbackHeaders } from '@/utils/withFallbackHeaders';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ metronomeCustomerId: string }> },
) {
  const apiKey = withFallbackHeaders(request.headers).metronomeApiKey;
  if (!apiKey) {
    return NextResponse.json({ data: [], next_page: null });
  }

  try {
    const { metronomeCustomerId } = await params;
    const body = await request.json();

    const {
      billableMetricId,
      windowSize = 'day',
      startingOn,
      endingBefore,
      currentPeriod,
      groupKey,
      groupFilters,
    } = body;

    if (!billableMetricId) {
      return NextResponse.json({ error: 'billableMetricId is required' }, { status: 400 });
    }

    const payload: Record<string, any> = {
      customer_id: metronomeCustomerId,
      billable_metric_id: billableMetricId,
      window_size: windowSize,
    };

    if (currentPeriod) {
      payload.current_period = true;
    } else {
      if (startingOn) payload.starting_on = startingOn;
      if (endingBefore) payload.ending_before = endingBefore;
    }

    if (groupKey?.length) payload.group_key = groupKey;
    if (groupFilters && Object.keys(groupFilters).length) {
      // Metronome expects values as arrays: { model: ["lora-mythic-4-6"] }
      payload.group_filters = Object.fromEntries(
        Object.entries(groupFilters).map(([k, v]) => [k, Array.isArray(v) ? v : [v]]),
      );
    }

    console.log('[usage] payload to Metronome:', JSON.stringify(payload));

    const allData: any[] = [];
    let nextPage: string | null = null;

    // Paginate through all results
    do {
      const url = new URL('https://api.metronome.com/v1/usage/groups');
      if (nextPage) url.searchParams.set('next_page', nextPage);

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`Metronome usage API ${response.status}:`, errText);
        // Surface the real Metronome error to the client so it's visible in the UI
        return NextResponse.json(
          { error: `Metronome API error (${response.status})`, detail: errText },
          { status: response.status },
        );
      }

      const result = await response.json();
      console.log('[usage] Metronome response data length:', result.data?.length ?? 0);
      if (result.data?.length > 0) console.log('[usage] sample row:', JSON.stringify(result.data[0]));
      else console.log('[usage] EMPTY - full response:', JSON.stringify(result));
      allData.push(...(result.data ?? []));
      nextPage = result.next_page ?? null;
    } while (nextPage);

    return NextResponse.json({ data: allData });
  } catch (error: any) {
    const msg = error?.message ?? 'Failed to fetch usage';
    console.error('Error fetching Metronome usage:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
