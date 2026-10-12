import initializeStripe from '@/utils/stripe';
import { CUSTOMER_METADATA_KEYS } from '@/utils/constants';

/**
 * Blocks a user by setting the 'blocked' metadata field to 'true'.
 * @param customerId - The ID of the Stripe customer to block.
 */
export async function blockUser(customerId: string) {
  try {
    const stripe = initializeStripe(new Headers());

    await stripe.customers.update(customerId, {
      metadata: {
        [CUSTOMER_METADATA_KEYS.BLOCKED]: 'true',
      },
    });

    console.log(`Successfully blocked user: ${customerId}`);
  } catch (error) {
    console.error(`Failed to block user ${customerId}:`, error);
    throw error;
  }
}

/**
 * Unblocks a user by clearing the 'blocked' metadata field.
 * @param customerId - The ID of the Stripe customer to unblock.
 */
export async function unblockUser(customerId: string) {
  try {
    const stripe = initializeStripe(new Headers());

    await stripe.customers.update(customerId, {
      metadata: {
        [CUSTOMER_METADATA_KEYS.BLOCKED]: 'false',
      },
    });

    console.log(`Successfully unblocked user: ${customerId}`);
  } catch (error) {
    console.error(`Failed to unblock user ${customerId}:`, error);
    throw error;
  }
}
