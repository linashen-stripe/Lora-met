import { NextRequest, NextResponse } from 'next/server';
import { withFallbackHeaders } from '@/utils/withFallbackHeaders';

// GET /api/metronome/billing-providers
// Lists all configured billing providers and their delivery method configurations
// for the Metronome account (account-level, not per-customer).
export async function GET(request: NextRequest) {
  const { metronomeApiKey } = withFallbackHeaders(request.headers);
  if (!metronomeApiKey) {
    return NextResponse.json({ error: 'Metronome not configured' }, { status: 503 });
  }

  const response = await fetch('https://api.metronome.com/v1/listConfiguredBillingProviders', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${metronomeApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const error = await response.text();
    return NextResponse.json({ error }, { status: response.status });
  }

  const data = await response.json();
  return NextResponse.json(data);
}
