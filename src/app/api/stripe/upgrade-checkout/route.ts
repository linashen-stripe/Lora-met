import { NextRequest, NextResponse } from 'next/server';
import initializeStripe from '@/utils/stripe';
import { initializeMetronome, listPackages } from '@/utils/metronome';
import { pickMetronomePackageForTier } from '@/utils/metronomePackageResolve';
import { getPublicOriginFromRequest } from '@/utils/getPublicOriginFromRequest';
import { normalizeDemoMode, type DemoMode } from '@/config/demoModes';
import { getStripeLocale } from '@/utils/stripe/localeUtils';

/** Metronome usage ingest allows roughly 33 days of history; cap backdating here. */
const MAX_CONTRACT_START_DAYS_AGO = 33;

interface RequestBody {
  stripeCustomerId: string;
  metronomeCustomerId: string;
  language?: string;
  /**
   * When set (e.g. 30), the Metronome contract starts that many days in the past
   * (demo quickstart) and usage seeding runs after checkout.
   */
  contractStartDaysAgo?: number;
  /**
   * Post-checkout usage seeding calls `/api/metronome/seed-usage` (demo project_id splits for charts).
   */
  /** Metronome package to attach after setup (name matched case-insensitively). Default `premium`. */
  contractPackage?: 'premium' | 'enterprise';
  seedPersona?: 'pro' | 'quickstart';
  demoMode?: DemoMode;
  uiMode?: 'embedded' | 'hosted';
}

export async function POST(request: NextRequest) {
  try {
    const stripe = initializeStripe(request.headers);
    const metronome = initializeMetronome(request.headers);

    if (!metronome) {
      return NextResponse.json(
        { message: 'Metronome API key not set' },
        { status: 503 },
      );
    }

    const {
      stripeCustomerId,
      metronomeCustomerId,
      language = 'en',
      contractStartDaysAgo: rawDaysAgo,
      contractPackage = 'premium',
      seedPersona,
      demoMode: rawDemoMode,
      uiMode = 'hosted',
    }: RequestBody = await request.json();
    const demoMode = normalizeDemoMode(rawDemoMode);

    const contractStartDaysAgo =
      typeof rawDaysAgo === 'number' && rawDaysAgo > 0
        ? Math.min(Math.floor(rawDaysAgo), MAX_CONTRACT_START_DAYS_AGO)
        : undefined;

    if (!stripeCustomerId || !metronomeCustomerId) {
      return NextResponse.json(
        { message: 'Missing customer IDs' },
        { status: 400 },
      );
    }

    const packages = await listPackages(metronome);
    const label = contractPackage === 'enterprise' ? 'Enterprise' : 'Premium';
    const metronomePackage = pickMetronomePackageForTier(
      packages as { id: string; name?: string }[],
      contractPackage === 'enterprise' ? 'enterprise' : 'premium',
      demoMode,
    );

    if (!metronomePackage) {
      return NextResponse.json(
        { message: `${label} package not found in Metronome` },
        { status: 404 },
      );
    }

    const baseUrl =
      getPublicOriginFromRequest(request) ||
      process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '');
    const isEmbedded = uiMode === 'embedded';

    // Collect payment method only — Metronome will invoice the $20 subscription
    // fee immediately via ADVANCE collection and charge via the Stripe billing provider
    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      currency: 'usd',
      customer: stripeCustomerId,
      ui_mode: isEmbedded ? 'embedded' : 'hosted',
      locale: getStripeLocale(language),
      billing_address_collection: 'required',
      customer_update: {
        address: 'auto',
      },
      metadata: {
        metronomeCustomerId,
        packageId: metronomePackage.id,
        packageName: metronomePackage.name ?? '',
        language,
        demoMode,
        ...(seedPersona ? { seedPersona } : {}),
        ...(contractStartDaysAgo
          ? {
              contractStartDaysAgo: String(contractStartDaysAgo),
              seedUsageAfter: 'true',
            }
          : {}),
      },
      ...(isEmbedded
        ? { redirect_on_completion: 'never' as const }
        : {
            success_url: `${baseUrl}/api/stripe/upgrade-checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/${language}/demos/${demoMode}`,
          }),
    });

    return NextResponse.json(
      isEmbedded
        ? {
            sessionId: session.id,
            clientSecret: session.client_secret,
            package: metronomePackage,
          }
        : { url: session.url },
    );
  } catch (error) {
    console.error('Upgrade checkout error:', error);
    return NextResponse.json(
      { message: 'Failed to create checkout session' },
      { status: 500 },
    );
  }
}
