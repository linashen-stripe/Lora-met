import { NextRequest, NextResponse } from 'next/server';
import { withFallbackHeaders } from '@/utils/withFallbackHeaders';
import { tracedServerFetch } from '@/utils/tracedServerFetch';

export async function GET(request: NextRequest) {
  const apiKey = withFallbackHeaders(request.headers).metronomeApiKey;
  if (!apiKey) {
    return NextResponse.json({ metrics: [] });
  }

  try {
    const response = await tracedServerFetch(request.headers, 'metronome', 'https://api.metronome.com/v1/billable-metrics', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Metronome API error: ${response.status}`);
    }

    const body = await response.json();
    const metrics = body.data ?? [];
    return NextResponse.json({ metrics });
  } catch (error) {
    console.error('Error fetching Metronome billable metrics:', error);
    return NextResponse.json({ error: 'Failed to fetch billable metrics' }, { status: 500 });
  }
}
