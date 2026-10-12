import { NextRequest, NextResponse } from 'next/server';
import initializeStripe from '@/utils/stripe';
import { getStripeCustomerId } from '@/utils/withFallbackHeaders';

interface RequestBody {
  billingIntentId: string;
  paymentMethodId: string;
}

// Complete a billing intent for a pricing plan
export async function POST(request: NextRequest) {
  try {
    const stripe = initializeStripe(request.headers);

    const customer = getStripeCustomerId(request.headers);
    const { billingIntentId, paymentMethodId }: RequestBody =
      await request.json();

    if (!customer) {
      return NextResponse.json(
        { error: 'Stripe customer id is required' },
        { status: 400 },
      );
    }

    // Find the billing intent
    const billingIntent =
      await stripe.v2.billing.intents.retrieve(billingIntentId);

    if (!billingIntent) {
      return NextResponse.json(
        { error: 'Billing intent not found' },
        { status: 404 },
      );
    }

    if (billingIntent.status !== 'draft') {
      return NextResponse.json(
        { error: 'Billing intent is not in draft status' },
        { status: 400 },
      );
    }

    // Attach the payment method to the customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customer,
    });

    // Set it as the default payment method
    await stripe.customers.update(customer, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Reserve the billing intent
    await stripe.v2.billing.intents.reserve(billingIntent.id);
    console.log(`✅ Billing Intent reserved: ${billingIntent.id}`);

    // Create and confirm a payment intent if the billing intent has an amount
    let paymentIntent = null;
    if (Number(billingIntent.amount_details.total) > 0) {
      paymentIntent = await stripe.paymentIntents.create({
        customer: customer,
        amount: Number(billingIntent.amount_details.total) ?? 0,
        currency: billingIntent.amount_details.currency ?? 'usd',
      });
      console.log(`✅ Payment Intent created: ${paymentIntent.id}`);

      // Confirm the Payment Intent
      await stripe.paymentIntents.confirm(paymentIntent.id, {
        payment_method: paymentMethodId,
        return_url: 'https://www.stripe.com',
      });
      console.log(`✅ Payment Intent confirmed: ${paymentIntent.id}`);
    } else {
      console.log(
        `⚠️ Billing Intent has amount of 0, skipping payment intent creation and committing the Billing Intent`,
      );
    }

    // Commit the Billing Intent to finalize the subscription
    const params = paymentIntent ? { payment_intent: paymentIntent.id } : {};
    const commitedIntent = await stripe.v2.billing.intents.commit(
      billingIntent.id,
      params,
    );
    console.log(`✅ Billing Intent committed: ${commitedIntent.id}`);

    // Return the committed` billing intent
    return NextResponse.json(commitedIntent);
  } catch (err) {
    console.error('Error: ', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 },
    );
  }
}
