import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import Metronome from '@metronome/sdk';
import Stripe from 'stripe';
import { STRIPE_API_VERSION } from '@/utils/stripe';
import { withFallbackHeaders } from '@/utils/withFallbackHeaders';

export const runtime = 'nodejs';

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 8);
}

export async function GET(request: Request) {
  const requestedSource =
    request.headers.get('x-admin-credential-source') === 'explicit'
      ? 'explicit'
      : 'configured';
  const resolved = withFallbackHeaders(request.headers);
  const metronomeSource = request.headers.get('demo-metronomeapikey')
    ? requestedSource === 'explicit'
      ? 'Explicit Admin credential'
      : 'Tools Panel override'
    : process.env.METRONOME_API_KEY
      ? 'Server environment'
      : 'Missing';
  const stripeSource = request.headers.get('demo-stripesecretkey')
    ? requestedSource === 'explicit'
      ? 'Explicit Admin credential'
      : 'Tools Panel override'
    : process.env.STRIPE_SECRET_KEY
      ? 'Server environment'
      : 'Missing';

  const result = {
    requestedSource,
    metronome: {
      configured: Boolean(resolved.metronomeApiKey),
      connected: false,
      source: metronomeSource,
      fingerprint: resolved.metronomeApiKey
        ? fingerprint(resolved.metronomeApiKey)
        : null,
      error: null as string | null,
    },
    stripe: {
      configured: Boolean(resolved.stripeSecretKey),
      connected: false,
      source: stripeSource,
      accountId: null as string | null,
      error: null as string | null,
    },
  };

  await Promise.all([
    resolved.metronomeApiKey
      ? new Metronome({ bearerToken: resolved.metronomeApiKey }).v1.customers
          .list({ limit: 1 })
          .then(() => {
            result.metronome.connected = true;
          })
          .catch((error: unknown) => {
            result.metronome.error =
              error instanceof Error ? error.message : 'Connection failed';
          })
      : Promise.resolve(),
    resolved.stripeSecretKey
      ? new Stripe(resolved.stripeSecretKey, {
          apiVersion: STRIPE_API_VERSION,
        }).accounts
          .retrieve()
          .then((account) => {
            result.stripe.connected = true;
            result.stripe.accountId = account.id;
          })
          .catch((error: unknown) => {
            result.stripe.error =
              error instanceof Error ? error.message : 'Connection failed';
          })
      : Promise.resolve(),
  ]);

  return NextResponse.json(result);
}
