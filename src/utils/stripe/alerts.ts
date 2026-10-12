import Stripe from 'stripe';
import initializeStripe from '@/utils/stripe';

export async function setupCreditBalanceAlert(
  customerId: string,
  threshold: number,
  currency: string = 'usd',
  headers?: Headers,
) {
  try {
    const stripe = initializeStripe(headers ?? new Headers());
    const alert = await stripe.billing.alerts.create({
      title: 'Credit Balance Alert',
      alert_type: 'credit_balance_threshold',
      credit_balance_threshold: {
        lte: {
          balance_type: 'monetary',
          monetary: {
            currency: currency.toLowerCase(),
            value: threshold,
          },
        },
        filters: [
          {
            type: 'customer',
            customer: customerId,
          },
        ],
      },
    });

    console.log('Alert created:', alert.id);
    return alert;
  } catch (error) {
    console.error('Error creating alert:', error);
    throw error;
  }
}
