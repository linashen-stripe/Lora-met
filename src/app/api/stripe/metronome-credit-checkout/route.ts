import { NextRequest, NextResponse } from 'next/server';
import initializeStripe from '@/utils/stripe';
import {
  getStripeCustomerIdFromMetronomeCustomer,
  initializeMetronome,
} from '@/utils/metronome';
import { pickPrimaryMetronomeContract } from '@/utils/metronomeContractPool';
import { normalizeDemoMode, type DemoMode } from '@/config/demoModes';
import { getPublicOriginFromRequest } from '@/utils/getPublicOriginFromRequest';

const METRONOME_CHECKOUT_API_VERSION = '2026-09-30.preview';
const USD_CREDIT_TYPE_ID = '2714e483-4ff1-48c5-b37b-a41c836328bd';
const PURCHASE_COMMIT_NAME = 'Checkout Credit Purchase';
const PURCHASE_TAX_CODE = 'txcd_10103000';

type CreateRequest = {
  metronomeCustomerId?: string;
  contractId?: string;
  demoMode?: DemoMode;
  creditTypeId?: string;
  currency?: string;
  uiMode?: 'form' | 'hosted_page';
  language?: string;
};

function currentHour(): Date {
  const value = new Date();
  value.setUTCMinutes(0, 0, 0);
  return value;
}

function addDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function stripeCustomerId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (
    value &&
    typeof value === 'object' &&
    'id' in value &&
    typeof value.id === 'string'
  ) {
    return value.id;
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const metronome = initializeMetronome(request.headers);
    if (!metronome) {
      return NextResponse.json(
        { error: 'Metronome API key is not configured.' },
        { status: 503 },
      );
    }

    const body = (await request.json()) as CreateRequest;
    const metronomeCustomerId = body.metronomeCustomerId?.trim();
    const requestedContractId = body.contractId?.trim();
    const demoMode = normalizeDemoMode(body.demoMode);
    const uiMode = body.uiMode === 'hosted_page' ? 'hosted_page' : 'form';
    const currency = /^[a-z]{3}$/i.test(body.currency ?? '')
      ? body.currency!.toLowerCase()
      : 'usd';

    if (!metronomeCustomerId) {
      return NextResponse.json(
        { error: 'Metronome customer ID is required.' },
        { status: 400 },
      );
    }

    const linkedStripeCustomerId =
      await getStripeCustomerIdFromMetronomeCustomer(
        metronome,
        metronomeCustomerId,
      );
    if (!linkedStripeCustomerId) {
      return NextResponse.json(
        { error: 'This Metronome customer is not linked to Stripe.' },
        { status: 409 },
      );
    }

    const contractsResponse = await metronome.v2.contracts.list({
      customer_id: metronomeCustomerId,
      covering_date: new Date().toISOString(),
    });
    const activeContracts = contractsResponse.data ?? [];
    const contract =
      activeContracts.find(
        (candidate) => candidate.id === requestedContractId,
      ) ?? pickPrimaryMetronomeContract(activeContracts);
    if (!contract) {
      return NextResponse.json(
        { error: 'No active Metronome contract was found.' },
        { status: 404 },
      );
    }

    const contractBalances = [
      ...(contract.credits ?? []),
      ...(contract.commits ?? []),
    ];
    const isPurchasedBalance = (item: any) =>
      /top[\s-]?up|recharge|purchase|checkout/i.test(item.name ?? '');
    const hasUsageApplicability = (item: any) =>
      (item.applicable_product_ids?.length ?? 0) > 0 ||
      (item.applicable_product_tags?.length ?? 0) > 0;
    const sourceBalance =
      contractBalances.find(
        (item: any) =>
          !isPurchasedBalance(item) &&
          hasUsageApplicability(item) &&
          item.product?.id,
      ) ??
      contractBalances.find(
        (item: any) => !isPurchasedBalance(item) && item.product?.id,
      );
    const metronomeProductId =
      sourceBalance?.product?.id ?? (sourceBalance as any)?.product_id;
    if (!metronomeProductId) {
      return NextResponse.json(
        { error: 'Could not resolve a Metronome product for the purchase.' },
        { status: 409 },
      );
    }

    const usesCustomCredit =
      demoMode === 'generation' &&
      Boolean(body.creditTypeId) &&
      body.creditTypeId !== USD_CREDIT_TYPE_ID;
    if (demoMode === 'generation' && !usesCustomCredit) {
      return NextResponse.json(
        { error: 'Generation credit type is not available yet.' },
        { status: 409 },
      );
    }

    const startsAt = currentHour();
    const endsBefore = addDays(startsAt, 90);
    const options = usesCustomCredit
      ? [500, 1_000, 2_500, 5_000]
      : [1_000, 2_500, 5_000, 10_000];
    const customMinimum = usesCustomCredit ? 500 : 500;
    const customMaximum = usesCustomCredit ? 100_000 : 1_000_000;
    // `up_to` is inclusive. End the undiscounted tiers one unit below the
    // advertised thresholds so 2,000 receives 5% and 5,000 receives 10%.
    // Generation custom credits and AI Builder USD cents both use $0.01 units.
    const discountTiers = [
      { up_to: '1999', discount_percentage: 0 },
      { up_to: '4999', discount_percentage: 5 },
      { up_to: 'inf', discount_percentage: 10 },
    ];

    const checkoutSessionParams = {
      ui_mode: uiMode,
      customer: linkedStripeCustomerId,
      adaptive_pricing: { enabled: true },
      automatic_tax: { enabled: true },
      billing_address_collection: 'auto',
      customer_update: { address: 'auto' },
      saved_payment_method_options: {
        allow_redisplay_filters: ['always', 'limited', 'unspecified'],
        payment_method_remove: 'enabled',
        payment_method_save: 'enabled',
      },
      metadata: {
        flow: 'metronome_credit_purchase',
        metronome_customer_id: metronomeCustomerId,
        metronome_contract_id: contract.id,
      },
      items: [
        {
          type: 'metronome_commit',
          metronome_commit: {
            metronome_contract: contract.id,
            price_configuration: {
              currency,
              tax_behavior: 'exclusive',
            },
            commits: [
              {
                name: PURCHASE_COMMIT_NAME,
                description: 'Credits valid for 90 days from purchase',
                metronome_product: metronomeProductId,
                applicable_metronome_product_tags: ['usage'],
                tax_details: { tax_code: PURCHASE_TAX_CODE },
                commit_options: {
                  starting_at: startsAt.toISOString(),
                  ending_before: endsBefore.toISOString(),
                  options: options.map((accessAmount) => ({
                    access_amount: accessAmount,
                    default_option: accessAmount === options[1],
                  })),
                  custom_amount: {
                    enabled: true,
                    minimum: customMinimum,
                    maximum: customMaximum,
                  },
                  discount_tiers: discountTiers,
                },
                ...(usesCustomCredit
                  ? { credit_type_id: body.creditTypeId }
                  : {}),
              },
            ],
          },
        },
      ],
      ...(uiMode === 'hosted_page'
        ? {
            success_url: `${getPublicOriginFromRequest(request)}/${
              body.language || 'en'
            }/dashboard/usage?credit_purchase_session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${getPublicOriginFromRequest(request)}/${
              body.language || 'en'
            }/dashboard/usage`,
          }
        : {}),
    };
    const stripe = initializeStripe(request.headers, {
      apiVersion: METRONOME_CHECKOUT_API_VERSION as any,
    });
    // Test customers created with reusable `pm_card_*` methods keep billing
    // identity on the Customer rather than copying it to the PaymentMethod.
    // Checkout requires those fields on the saved card before it can redisplay
    // it, so normalize the invoice default before creating the Session.
    const stripeCustomer = await stripe.customers.retrieve(
      linkedStripeCustomerId,
    );
    if (!stripeCustomer.deleted) {
      const defaultPaymentMethodId = stripeCustomerId(
        stripeCustomer.invoice_settings.default_payment_method,
      );
      if (defaultPaymentMethodId) {
        const address = stripeCustomer.address;
        await stripe.paymentMethods.update(defaultPaymentMethodId, {
          allow_redisplay: 'always',
          billing_details: {
            name: stripeCustomer.name ?? undefined,
            email: stripeCustomer.email ?? undefined,
            phone: stripeCustomer.phone ?? undefined,
            address: {
              line1: address?.line1 ?? undefined,
              line2: address?.line2 ?? undefined,
              city: address?.city ?? undefined,
              state: address?.state ?? undefined,
              postal_code: address?.postal_code ?? undefined,
              country: address?.country ?? undefined,
            },
          },
        });
      }
    }
    const session = await stripe.checkout.sessions.create(
      checkoutSessionParams as any,
    );

    if (uiMode === 'form' && !session.client_secret) {
      return NextResponse.json(
        { error: 'Stripe did not return an embedded Checkout client secret.' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      sessionId: session.id,
      uiMode,
      ...(uiMode === 'hosted_page'
        ? { url: session.url }
        : { clientSecret: session.client_secret }),
      startsAt: startsAt.toISOString(),
      endsBefore: endsBefore.toISOString(),
    });
  } catch (error) {
    console.error('[metronome-credit-checkout] create failed:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Could not create Checkout.' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('session_id')?.trim();
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Checkout Session ID is required.' },
        { status: 400 },
      );
    }

    const stripe = initializeStripe(request.headers, {
      apiVersion: METRONOME_CHECKOUT_API_VERSION as any,
    });
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const metronomeCustomerId = session.metadata?.metronome_customer_id?.trim();
    const contractId = session.metadata?.metronome_contract_id?.trim();
    if (!metronomeCustomerId || !contractId) {
      return NextResponse.json(
        { error: 'Checkout Session is missing Metronome metadata.' },
        { status: 409 },
      );
    }

    const metronome = initializeMetronome(request.headers);
    if (!metronome) {
      return NextResponse.json(
        { error: 'Metronome API key is not configured.' },
        { status: 503 },
      );
    }
    const linkedStripeCustomerId =
      await getStripeCustomerIdFromMetronomeCustomer(
        metronome,
        metronomeCustomerId,
      );
    if (
      !linkedStripeCustomerId ||
      linkedStripeCustomerId !== stripeCustomerId(session.customer)
    ) {
      return NextResponse.json(
        { error: 'Checkout Session customer does not match Metronome.' },
        { status: 409 },
      );
    }

    const contractResponse = await metronome.v2.contracts.retrieve({
      customer_id: metronomeCustomerId,
      contract_id: contractId,
      include_balance: true,
    });
    const sessionCreatedAt = new Date(session.created * 1000).getTime();
    const createdCommit = (contractResponse.data.commits ?? []).find(
      (commit: any) =>
        commit.name === PURCHASE_COMMIT_NAME &&
        new Date(commit.created_at ?? 0).getTime() >= sessionCreatedAt,
    );

    return NextResponse.json({
      ready: Boolean(createdCommit),
      paymentStatus: session.payment_status,
      sessionStatus: session.status,
      commitId: createdCommit?.id ?? null,
    });
  } catch (error) {
    console.error('[metronome-credit-checkout] status failed:', error);
    return NextResponse.json(
      {
        error: (error as Error).message || 'Could not verify credit purchase.',
      },
      { status: 500 },
    );
  }
}
