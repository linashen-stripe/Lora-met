import { useQuery } from '@tanstack/react-query';
import { useConfigContext } from '@/contexts/ConfigContext';
import fetchClient from '@/utils/fetchClient';
import { formatPrice, formatTimestamp } from '@/utils/helpers';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import Stripe from 'stripe';
import Skeleton from '@/components/ui/Skeleton';

interface InvoicesProps {
  subscription: {
    invoice_history: Stripe.Invoice[];
    currency: string;
    metadata: { [key: string]: string };
  } | null;
}

const Invoices = ({ subscription }: InvoicesProps) => {
  const { t } = useTranslation();
  const { settings, customer } = useConfigContext();

  // Use React Query for invoice fetching - always fresh (staleTime: 0)
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['settings-invoices', customer?.id],
    queryFn: async () => {
      const { data } = await fetchClient.get(
        `/api/stripe/customer/${customer?.id}/invoices`,
      );
      return data;
    },
    enabled: Boolean(customer?.id),
    staleTime: 0, // Always fetch fresh data for demos
  });

  return (
    <div className='bg-white rounded-lg shadow p-6'>
      <h2 className='text-xl font-semibold mb-4'>
        {t('settings.invoices.title')}
      </h2>
      {isLoading ? (
        <table className='w-full'>
          <thead>
            <tr className='text-left text-gray-600'>
              <th>{t('settings.invoices.date')}</th>
              <th>{t('settings.invoices.total')}</th>
              <th>{t('settings.invoices.status')}</th>
              <th>{t('settings.invoices.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {/* Show 3-4 skeleton rows to match typical invoice list */}
            {[...Array(4)].map((_, i) => (
              <tr key={i}>
                <td className='py-3'>
                  <Skeleton className='h-4 w-28' />
                </td>
                <td className='py-3'>
                  <Skeleton className='h-4 w-20' />
                </td>
                <td className='py-3'>
                  <Skeleton className='h-4 w-16' />
                </td>
                <td className='py-3'>
                  <Skeleton className='h-5 w-5 rounded' />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : invoices.length > 0 ? (
        <table className='w-full'>
          <thead>
            <tr className='text-left text-gray-600'>
              <th>{t('settings.invoices.date')}</th>
              <th>{t('settings.invoices.total')}</th>
              <th>{t('settings.invoices.status')}</th>
              <th>{t('settings.invoices.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice: Stripe.Invoice) => (
              <tr key={invoice.id}>
                <td>
                  {formatTimestamp(
                    invoice.created,
                    'short',
                    settings?.language || 'en',
                  )}
                </td>
                <td>
                  {formatPrice(
                    invoice.total,
                    settings?.language,
                    invoice?.currency,
                    t('loading'),
                  )}
                </td>
                <td>
                  {subscription?.metadata?.external_payment_method
                    ? 'PAID'
                    : invoice.status?.toUpperCase()}
                </td>
                <td>
                  <Link href={invoice.invoice_pdf || ''} target='_blank'>
                    <ArrowDownTrayIcon className='h-5 w-5 text-purple ml-5 flex-shrink-0 cursor-pointer' />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className='text-sm font-medium '>{t('settings.invoices.none')}</p>
      )}
    </div>
  );
};

export default Invoices;
