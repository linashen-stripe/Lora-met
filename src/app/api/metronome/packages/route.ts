import { NextRequest, NextResponse } from 'next/server';
import { initializeMetronome, listPackages } from '@/utils/metronome';

export async function GET(request: NextRequest) {
  try {
    const metronome = initializeMetronome(request.headers);
    if (!metronome) {
      return NextResponse.json({ packages: [] });
    }
    const packages = await listPackages(metronome);

    // Enrich each package with a derived price_cents field:
    // - Free/trial packages: $0
    // - Packages with a subscription: look up subscription product price from rate card
    // - Everything else (enterprise/commit-based): null = "Custom Pricing"
    const enriched = await Promise.all(
      packages.map(async (pkg: any) => {
        if (/free|trial/i.test(pkg.name ?? '')) {
          return { ...pkg, price_cents: 0 };
        }

        if (pkg.rate_card_id && pkg.subscriptions?.length) {
          const subscription = pkg.subscriptions[0];
          const subscriptionProductId = subscription?.subscription_rate?.product?.id;
          const billingFrequency = subscription?.subscription_rate?.billing_frequency;
          if (subscriptionProductId) {
            try {
              const rates: any[] = [];
              for await (const r of metronome.v1.contracts.rateCards.rates.list({
                rate_card_id: pkg.rate_card_id,
                at: new Date().toISOString(),
                selectors: [{ product_id: subscriptionProductId }],
              })) rates.push(r);

              const subRate = rates.find(
                (r: any) =>
                  r.product_id === subscriptionProductId &&
                  (!billingFrequency || r.billing_frequency === billingFrequency),
              );
              if (subRate != null && subRate.rate?.price != null) {
                return { ...pkg, price_cents: subRate.rate.price };
              }
            } catch {
              // rate card lookup failed — fall through to null
            }
          }
        }

        return { ...pkg, price_cents: null };
      }),
    );

    return NextResponse.json({ packages: enriched });
  } catch (error) {
    console.error('Error listing Metronome packages:', error);
    return NextResponse.json(
      { error: 'Failed to list packages' },
      { status: 500 },
    );
  }
}
