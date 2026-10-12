import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import initializeStripe, { STRIPE_API_VERSION } from '@/utils/stripe';
import { getStripeCustomerId, withFallbackHeaders } from '@/utils/withFallbackHeaders';
import { getStripeLocale } from '@/utils/stripe/localeUtils';

interface CartItem {
  priceId: string;
  quantity: number;
}

interface RequestBody {
  cart: CartItem[];
  settings: {
    language?: string;
    currency?: string;
  };
  pricingPlanLookupKey: string;
  successUrl?: string;
  cancelUrl?: string;
  uiMode: 'embedded' | 'hosted';
  metadata?: Record<string, string>;
}

export async function POST(request: NextRequest) {
  try {
    const stripe = initializeStripe(request.headers);

    const { language } = withFallbackHeaders(request.headers);
    const {
      settings,
      pricingPlanLookupKey,
      successUrl,
      cancelUrl,
      uiMode,
      metadata,
    }: RequestBody = await request.json();

    const stripeCustomerId = getStripeCustomerId(request.headers);
    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: 'Stripe customer ID is required' },
        { status: 400 },
      );
    }

    // Find the pricing plan by lookup key
    const pricingPlans = await stripe.v2.billing.pricingPlans.list({
      lookup_keys: [pricingPlanLookupKey],
      limit: 1,
    });

    const pricingPlan = pricingPlans.data[0];

    if (!pricingPlan) {
      return NextResponse.json(
        { error: 'Pricing plan not found' },
        { status: 404 },
      );
    }

    if (!pricingPlan.live_version) {
      return NextResponse.json(
        { error: 'Pricing plan has no live version' },
        { status: 404 },
      );
    }

    // Find associated components for the pricing plan, some may need configuration
    const componentList = await stripe.v2.billing.pricingPlans.components.list(
      pricingPlan.id,
    );

    // Configure all license fee components to have a quantity of 1
    const configuredComponents = componentList.data
      .filter((c) => c.type === 'license_fee')
      .reduce((acc: any, component) => {
        acc[component.id] = {
          type: 'license_fee_component',
          license_fee_component: {
            quantity: 1,
          },
        };
        return acc;
      }, {});

    const session = await stripe.checkout.sessions.create(
      {
        customer: stripeCustomerId,
        currency: pricingPlan.currency,
        ui_mode: uiMode,
        locale: getStripeLocale(settings?.language || language || 'en'),
        metadata: metadata,
        automatic_tax: {
          enabled: true,
        },
        customer_update: {
          address: 'auto',
        },
        // Disable redirects for embedded checkout
        ...(uiMode === 'embedded' ? { redirect_on_completion: 'never' } : {}),
        // For hosted checkout, we need to set the success and cancel URLs
        success_url: successUrl,
        cancel_url: cancelUrl,
        checkout_items: [
          {
            type: 'pricing_plan_subscription_item',
            pricing_plan_subscription_item: {
              pricing_plan: pricingPlan.id,
              pricing_plan_version: pricingPlan.live_version,
              component_configurations: configuredComponents,
            },
          },
        ],
      },
      {
        // Requires private version for `checkout_items` access.
        // docs: https://docs.corp.stripe.com/api/checkout/sessions/object#checkout_session_object-checkout_items
        apiVersion: `${STRIPE_API_VERSION};checkout_product_catalog_preview=v1`,
      },
    );

    return NextResponse.json({
      sessionId: session.id,
      clientSecret: session.client_secret,
      url: uiMode === 'hosted' ? session.url : undefined,
    });
  } catch (err) {
    console.error('Error: ', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 },
    );
  }
}
