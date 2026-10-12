import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import initializeStripe from '@/utils/stripe';
import { withFallbackHeaders } from '@/utils/withFallbackHeaders';

export async function POST(request: NextRequest) {
  try {
    const stripe = initializeStripe(request.headers);
    const { items, shippingAddress, customerId } = await request.json();

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Invalid or empty items array' },
        { status: 400 },
      );
    }

    if (!shippingAddress) {
      return NextResponse.json(
        { error: 'Shipping address is empty' },
        { status: 400 },
      );
    }

    await stripe.customers.update(customerId, { address: shippingAddress });

    const demoConfig = withFallbackHeaders(request.headers);

    if (!demoConfig.stripeSecretKey) {
      return NextResponse.json(
        { error: 'Stripe Secret Key is not available' },
        { status: 400 },
      );
    }

    if (!demoConfig.currency) {
      return NextResponse.json(
        { error: 'Currency is not specified' },
        { status: 400 },
      );
    }

    const lineItemsForTaxPromises = items
      .filter((item) => item.quantity > 0) // handle ubb cases
      .map(async (cartItem) => {
        const priceList = await stripe.prices.list({
          lookup_keys: [cartItem.priceId],
          limit: 1,
        });
        if (priceList.data.length === 0) {
          throw new Error(
            `Price not found for lookup key: ${cartItem.priceId}`,
          );
        }

        return {
          price: priceList.data[0].id,
          quantity: cartItem.quantity,
        };
      });

    const lineItemsForTax = await Promise.all(lineItemsForTaxPromises);

    // Create an invoice preview
    const invoicePreview = await stripe.invoices.createPreview({
      customer: customerId,
      subscription_details: { items: lineItemsForTax },
      automatic_tax: { enabled: true },
    });

    // Extract tax details
    const taxAmount =
      (invoicePreview as any).total_tax_amounts?.reduce(
        (sum: any, tax: any) => sum + tax.amount,
        0,
      ) ?? 0;

    return NextResponse.json({
      tax: taxAmount,
      taxDetails: (invoicePreview as any).total_tax_amounts,
    });
  } catch (error) {
    console.error('Error in tax calculation:', error);

    if (error instanceof Stripe.errors.StripeError) {
      return NextResponse.json(
        { error: 'Stripe API error occurred or bad API keys provided' },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: 'An internal server error occurred' },
      { status: 500 },
    );
  }
}
