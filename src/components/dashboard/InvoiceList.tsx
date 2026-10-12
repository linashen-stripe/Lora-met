import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useConfigContext } from '@/contexts/ConfigContext';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import {
  formatPrice,
  formatTimestamp,
  getInvoiceStatusTranslation,
} from '@/utils/helpers';
import Stripe from 'stripe';
import Skeleton from '@/components/ui/Skeleton';
import { MetronomeInvoice } from '@/utils/types';


// Extract a usable currency string from Metronome credit type name, e.g. "USD (cents)" → "usd"
function creditTypeNameToCurrency(name: string): string {
  const match = name.match(/^([A-Z]+)/);
  return match ? match[1].toLowerCase() : 'usd';
}

const InvoiceList = ({
  invoices,
  metronomeInvoices,
  isLoading,
}: {
  invoices: Stripe.Invoice[] | null;
  metronomeInvoices?: MetronomeInvoice[] | null;
  isLoading: boolean;
}) => {
  const { t } = useTranslation();
  const { settings } = useConfigContext();

  const skeletonRows = (
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
        {[...Array(4)].map((_, i) => (
          <tr key={i}>
            <td className='py-3'><Skeleton className='h-4 w-28' /></td>
            <td className='py-3'><Skeleton className='h-4 w-20' /></td>
            <td className='py-3'><Skeleton className='h-4 w-16' /></td>
            <td className='py-3'><Skeleton className='h-5 w-5 rounded' /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  // Metronome invoice rendering (null = not loaded yet; [] = loaded, possibly empty)
  if (metronomeInvoices !== undefined) {
    if (isLoading) {
      return (
        <Card className='mt-4 bg-white text-gray-900'>
          <CardHeader>
            <CardTitle>{t('settings.invoices.title')}</CardTitle>
            <CardDescription>{t('settings.invoices.description')}</CardDescription>
          </CardHeader>
          <CardContent>{skeletonRows}</CardContent>
        </Card>
      );
    }

    if (metronomeInvoices === null) {
      return (
        <Card className='mt-4 bg-white text-gray-900'>
          <CardHeader>
            <CardTitle>{t('settings.invoices.title')}</CardTitle>
            <CardDescription>{t('settings.invoices.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className='text-sm font-medium text-gray-600'>
              {t('settings.invoices.none')}
            </p>
          </CardContent>
        </Card>
      );
    }

    const visibleInvoices = metronomeInvoices.filter(
      (inv) => inv.status === 'FINALIZED' || inv.status === 'DRAFT',
    );

    return (
      <Card className='mt-4 bg-white text-gray-900'>
        <CardHeader>
          <CardTitle>{t('settings.invoices.title')}</CardTitle>
          <CardDescription>{t('settings.invoices.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {visibleInvoices.length > 0 ? (
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
                {visibleInvoices.map((invoice) => {
                  const dateStr = invoice.start_timestamp || invoice.issued_at;
                  const currency = creditTypeNameToCurrency(invoice.credit_type.name);
                  const invoiceUrl =
                    invoice.hosted_invoice_url ||
                    invoice.external_invoice?.pdf_url ||
                    null;
                  return (
                    <tr key={invoice.id} className='text-gray-900'>
                      <td className='py-2'>
                        {dateStr
                          ? new Date(dateStr).toLocaleDateString(
                              settings?.language || 'en',
                              { year: 'numeric', month: 'short', day: 'numeric' },
                            )
                          : '—'}
                      </td>
                      <td className='py-2'>
                        {formatPrice(invoice.total, settings?.language, currency, t('loading'))}
                      </td>
                      <td className='py-2'>
                        {invoice.stripeStatus === 'paid'
                          ? t('settings.invoices.paid')
                          : t(`settings.invoices.${invoice.status.toLowerCase()}`, invoice.status)}
                      </td>
                      <td className='py-2'>
                        {invoiceUrl ? (
                          <Link href={invoiceUrl} target='_blank'>
                            <ArrowDownTrayIcon className='h-5 w-5 text-purple hover:text-purple-hover ml-5 flex-shrink-0 cursor-pointer transition-colors' />
                          </Link>
                        ) : (
                          <span className='ml-5 h-5 w-5 inline-block' />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className='text-sm font-medium text-gray-600'>
              {t('settings.invoices.none')}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // Stripe invoice rendering (original behaviour)
  if (isLoading || !invoices) {
    return (
      <Card className='mt-4 bg-white text-gray-900'>
        <CardHeader>
          <CardTitle>{t('settings.invoices.title')}</CardTitle>
          <CardDescription>
            {t('settings.invoices.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>{skeletonRows}</CardContent>
      </Card>
    );
  }

  const finalizedInvoices = invoices.filter(
    (invoice: Stripe.Invoice) => invoice.status !== 'draft',
  );

  return (
    <Card className='mt-4 bg-white text-gray-900'>
      <CardHeader>
        <CardTitle>{t('settings.invoices.title')}</CardTitle>
        <CardDescription>{t('settings.invoices.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {finalizedInvoices.length > 0 ? (
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
              {finalizedInvoices.map((invoice: Stripe.Invoice) => (
                <tr key={invoice.id} className='text-gray-900'>
                  <td className='py-2'>
                    {formatTimestamp(
                      invoice.created,
                      'short',
                      settings?.language || 'en',
                    )}
                  </td>
                  <td className='py-2'>
                    {formatPrice(
                      invoice.total,
                      settings?.language,
                      invoice?.currency,
                      t('loading'),
                    )}
                  </td>
                  <td className='py-2'>
                    {getInvoiceStatusTranslation(invoice.status, t)}
                  </td>
                  <td className='py-2'>
                    <Link href={invoice.invoice_pdf || ''} target='_blank'>
                      <ArrowDownTrayIcon className='h-5 w-5 text-purple hover:text-purple-hover ml-5 flex-shrink-0 cursor-pointer transition-colors' />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className='text-sm font-medium text-gray-600'>
            {t('settings.invoices.none')}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default InvoiceList;
