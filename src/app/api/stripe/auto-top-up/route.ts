import { NextResponse } from 'next/server';
import { setupCreditBalanceAlert } from '@/utils/stripe/alerts';
import initializeStripe from '@/utils/stripe';
import { CUSTOMER_METADATA_KEYS } from '@/utils/constants';
import { getSubscriptionAndPlan } from '@/utils/stripe/subscriptions';
import { withFallbackHeaders } from '@/utils/withFallbackHeaders';

export async function POST(req: Request) {
  const body = await req.json();
  const { customerId, threshold, topUpAmount: topUpAmountInput } = body;

  if (
    !customerId ||
    threshold === undefined ||
    topUpAmountInput === undefined
  ) {
    return NextResponse.json(
      {
        error:
          'Missing required parameters: customerId, threshold and topUpAmount must be provided.',
      },
      { status: 400 },
    );
  }

  try {
    const stripe = initializeStripe(req.headers);

    // Get the customer's subscription to determine the currency
    const { plan } = await getSubscriptionAndPlan(customerId);
    const currency =
      plan?.currency || withFallbackHeaders(req.headers).currency || 'usd';

    // Convert dollar inputs to cents on the server to keep Stripe usage consistent
    const thresholdCents = Math.round(Number(threshold));
    const topUpAmount = Math.round(Number(topUpAmountInput));

    // Persist auto-top-up settings on the Stripe Customer metadata
    await stripe.customers.update(customerId, {
      metadata: {
        [CUSTOMER_METADATA_KEYS.AUTO_TOP_UP_ENABLED]: 'true',
        [CUSTOMER_METADATA_KEYS.AUTO_TOP_UP_THRESHOLD_CENTS]:
          String(thresholdCents),
        [CUSTOMER_METADATA_KEYS.AUTO_TOP_UP_AMOUNT_CENTS]: String(topUpAmount),
        [CUSTOMER_METADATA_KEYS.AUTO_TOP_UP_CURRENCY]: currency,
      },
    });

    console.log(
      `Setting up auto top-up alert for customer: ${customerId} with threshold(cents): ${thresholdCents} and top-up amount(cents): ${topUpAmount} in ${currency}`,
    );

    const alert = await setupCreditBalanceAlert(
      customerId,
      thresholdCents,
      currency,
      req.headers,
    );

    console.log('Successfully created alert:', alert.id);
    return NextResponse.json({
      message: 'Alert creation successful!',
      alertId: alert.id,
    });
  } catch (error: any) {
    console.error('Failed to create alert:', error);
    return NextResponse.json(
      { error: `Failed to create alert: ${error.message}` },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const customerId = url.searchParams.get('customerId');

  if (!customerId) {
    return NextResponse.json(
      { error: 'Missing required parameter: customerId' },
      { status: 400 },
    );
  }

  try {
    const stripe = initializeStripe(req.headers);
    const customer = await stripe.customers.retrieve(customerId);

    const autoTopUpEnabled =
      (customer as any).metadata?.[
        CUSTOMER_METADATA_KEYS.AUTO_TOP_UP_ENABLED
      ] === 'true';
    const thresholdCents = (customer as any).metadata?.[
      CUSTOMER_METADATA_KEYS.AUTO_TOP_UP_THRESHOLD_CENTS
    ];
    const topUpAmountCents = (customer as any).metadata?.[
      CUSTOMER_METADATA_KEYS.AUTO_TOP_UP_AMOUNT_CENTS
    ];
    const currency =
      (customer as any).metadata?.[
        CUSTOMER_METADATA_KEYS.AUTO_TOP_UP_CURRENCY
      ] || 'usd';

    return NextResponse.json({
      enabled: autoTopUpEnabled,
      threshold: thresholdCents ? Number(thresholdCents) / 100 : null,
      topUpAmount: topUpAmountCents ? Number(topUpAmountCents) / 100 : null,
      currency: currency,
    });
  } catch (error: any) {
    console.error('Failed to check auto top-up status:', error);
    return NextResponse.json(
      { error: `Failed to check status: ${error.message}` },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  const body = await req.json();
  const { customerId } = body;

  if (!customerId) {
    return NextResponse.json(
      { error: 'Missing required parameter: customerId' },
      { status: 400 },
    );
  }

  try {
    const stripe = initializeStripe(req.headers);

    // Clear all auto top-up related metadata
    await stripe.customers.update(customerId, {
      metadata: {
        [CUSTOMER_METADATA_KEYS.AUTO_TOP_UP_ENABLED]: '',
        [CUSTOMER_METADATA_KEYS.AUTO_TOP_UP_THRESHOLD_CENTS]: '',
        [CUSTOMER_METADATA_KEYS.AUTO_TOP_UP_AMOUNT_CENTS]: '',
        [CUSTOMER_METADATA_KEYS.AUTO_TOP_UP_CURRENCY]: '',
      },
    });

    console.log(
      `Auto top-up disabled and metadata cleared for customer: ${customerId}`,
    );

    return NextResponse.json({
      message: 'Auto top-up disabled successfully!',
    });
  } catch (error: any) {
    console.error('Failed to disable auto top-up:', error);
    return NextResponse.json(
      { error: `Failed to disable auto top-up: ${error.message}` },
      { status: 500 },
    );
  }
}
