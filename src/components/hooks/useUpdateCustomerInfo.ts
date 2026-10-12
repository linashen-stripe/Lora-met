import fetchClient from '@/utils/fetchClient';

export default async function updateCustomerInfo(
  customerData: { name?: string; address?: any },
  id: string,
) {
  try {
    const { error: customerError } = (await fetchClient.put(
      `/api/stripe/customer/${id}`,
      customerData,
    )) as { error: any };

    if (customerError) {
      console.log(
        customerError.message || 'An error occurred during submission',
      );
      return;
    }

    return { success: true };
  } catch (err) {
    console.log(err);
    return { success: false, error: err };
  }
}
