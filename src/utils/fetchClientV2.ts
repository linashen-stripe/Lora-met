// utils/stripeV2.ts

/**
 * Function to make requests to Stripe V2 API endpoints
 * @param endpoint - The endpoint path (without base URL)
 * @param options - Additional fetch options
 * @returns Promise with parsed response data
 */
export async function fetchClientV2<T = any>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const stripeApiKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeApiKey) {
    throw new Error('Stripe API key is not configured');
  }

  const url = `https://api.stripe.com/v2/${
    endpoint.startsWith('/') ? endpoint.substring(1) : endpoint
  }`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${stripeApiKey}`,
      'Stripe-Version': '2025-07-14.private',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      ...options.headers,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Stripe API error (${response.status}):`, errorText);
    throw new Error(`Stripe API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}
