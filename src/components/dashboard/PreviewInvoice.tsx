import { formatPrice, formatTimestamp } from '@/utils/helpers';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableFooter,
  TableRow,
} from '@/components/ui/table';
import Skeleton from '@/components/ui/Skeleton';
import Stripe from 'stripe';
import { MeteredItem } from '@/utils/types';
import { useConfigContext } from '@/contexts/ConfigContext';
import { useTranslation } from 'react-i18next';

const getMeteredItemName = (
  id: string,
  meteredItems: MeteredItem[],
  t: any,
) => {
  const meteredItem = meteredItems.find((m) => m.id === id);
  if (!meteredItem) return t('dashboard.invoice.unknown_item');

  const displayName = meteredItem.display_name;
  const model = meteredItem.meter_segment_conditions?.find(
    (c: { dimension: string; value: string }) => c.dimension === 'model',
  )?.value;

  // Combine displayName and model if model is not null
  return displayName + (model ? ` [${model}]` : '');
};

const isTokenLineItem = (
  meteredItemId: string,
  meteredItems: MeteredItem[],
  description?: string | null,
) => {
  if (meteredItemId) {
    const meteredItem = meteredItems.find((m) => m.id === meteredItemId);
    if (meteredItem) {
      const displayName = meteredItem.display_name?.toLowerCase() || '';
      // Look for AI Model tokens - they have "input" or "output" in name but not "image"
      return (
        (displayName.includes('input') || displayName.includes('output')) &&
        !displayName.includes('image')
      );
    }
  }

  // Fallback to description check
  if (description) {
    const descLower = description.toLowerCase();
    return (
      (descLower.includes('input') || descLower.includes('output')) &&
      !descLower.includes('image')
    );
  }

  return false;
};

function PreviewInvoice({
  invoice,
  meteredItems,
  isLoading = false,
}: {
  invoice: Stripe.Invoice | null;
  meteredItems: MeteredItem[];
  isLoading?: boolean;
}) {
  const { settings } = useConfigContext();
  const { t } = useTranslation();
  if (isLoading) {
    return (
      <Card className='mt-4 bg-white text-gray-900'>
        <CardHeader>
          <CardTitle>{t('dashboard.invoice.upcoming_title')}</CardTitle>
          <CardDescription>{t('dashboard.invoice.billing_period_ending')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('dashboard.invoice.description')}</TableHead>
                <TableHead>{t('dashboard.invoice.quantity')}</TableHead>
                <TableHead>{t('dashboard.invoice.unit_price')}</TableHead>
                <TableHead className='text-right'>{t('dashboard.invoice.amount')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...Array(3)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell className='font-medium'>
                    <Skeleton className='h-4 w-32' />
                  </TableCell>
                  <TableCell>
                    <Skeleton className='h-4 w-16' />
                  </TableCell>
                  <TableCell>
                    <Skeleton className='h-4 w-20' />
                  </TableCell>
                  <TableCell className='text-right'>
                    <Skeleton className='h-4 w-20' />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className='text-right' colSpan={3}>
                  {t('dashboard.invoice.subtotal')}
                </TableCell>
                <TableCell className='text-right'>
                  <Skeleton className='h-4 w-20' />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className='text-right font-bold' colSpan={3}>
                  {t('dashboard.invoice.total')}
                </TableCell>
                <TableCell className='text-right font-bold'>
                  <Skeleton className='h-4 w-20' />
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    );
  }

  // Handle case where there's no upcoming invoice (e.g., free plan users)
  if (!invoice) {
    return (
      <Card className='mt-4 bg-white text-gray-900'>
        <CardHeader>
          <CardTitle>{t('dashboard.invoice.upcoming_title')}</CardTitle>
          <CardDescription>
            {t('dashboard.invoice.no_upcoming_charges')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('dashboard.invoice.description')}</TableHead>
                <TableHead>{t('dashboard.invoice.quantity')}</TableHead>
                <TableHead>{t('dashboard.invoice.unit_price')}</TableHead>
                <TableHead className='text-right'>
                  {t('dashboard.invoice.amount')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className='font-medium text-gray-500' colSpan={4}>
                  {t('dashboard.invoice.no_charges')}
                </TableCell>
              </TableRow>
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className='text-right font-bold' colSpan={3}>
                  {t('dashboard.invoice.total')}
                </TableCell>
                <TableCell className='text-right font-bold'>
                  {formatPrice(0, settings?.language, settings?.currency)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className='mt-4 bg-white text-gray-900'>
      <CardHeader>
        <CardTitle>{t('dashboard.invoice.upcoming_title')}</CardTitle>
        <CardDescription>
          {t('dashboard.invoice.billing_period_ending')}{' '}
          {formatTimestamp(
            invoice.period_end,
            'short',
            settings?.language || 'en',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('dashboard.invoice.description')}</TableHead>
              <TableHead>{t('dashboard.invoice.quantity')}</TableHead>
              <TableHead>{t('dashboard.invoice.unit_price')}</TableHead>
              <TableHead className='text-right'>
                {t('dashboard.invoice.amount')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoice?.lines?.data.map((l: Stripe.InvoiceLineItem) => {
              const meteredItemId =
                l.pricing?.rate_card_rate_details?.metered_item;

              const displayName = meteredItemId
                ? getMeteredItemName(meteredItemId, meteredItems, t)
                : l.description;

              // Check if this is a token line item to adjust pricing display
              const isTokenItem = isTokenLineItem(
                meteredItemId || '',
                meteredItems,
                l.description,
              );

              // Get unit price - calculate from amount/quantity (most reliable for rate card items)
              // unit_amount_decimal is often null or 0 for V2 Billing rate card items
              let unitPrice = 0;

              // First try unit_amount_decimal if it has a non-zero value
              if (l.pricing?.unit_amount_decimal) {
                const decimalValue = Number(l.pricing.unit_amount_decimal);
                if (decimalValue > 0) {
                  unitPrice = decimalValue;
                }
              }

              // Fallback: calculate from amount/quantity (always works for rate card items)
              if (!unitPrice && l.amount && l.quantity) {
                unitPrice = l.amount / l.quantity;
              }

              // For token items, multiply by 1 million to show per-million pricing
              // (Stripe stores per-token prices, we want to display per-million-token prices)
              const displayUnitPrice = isTokenItem
                ? unitPrice * 1_000_000
                : unitPrice;

              return (
                <TableRow key={l.id}>
                  <TableCell className='font-medium'>{displayName}</TableCell>
                  <TableCell>{l.quantity?.toLocaleString()}</TableCell>
                  <TableCell>
                    {formatPrice(
                      displayUnitPrice,
                      settings?.language,
                      l.currency || settings?.currency,
                    )}
                    {isTokenItem &&
                      t('dashboard.invoice.million_tokens_suffix')}
                  </TableCell>
                  <TableCell className='text-right'>
                    {formatPrice(
                      l.amount,
                      settings?.language,
                      l.currency || settings?.currency,
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className='text-right' colSpan={3}>
                {t('dashboard.invoice.subtotal')}
              </TableCell>
              <TableCell className='text-right'>
                {formatPrice(
                  invoice?.subtotal ?? 0,
                  settings?.language,
                  settings?.currency,
                )}
              </TableCell>
            </TableRow>
            {invoice?.total_pretax_credit_amounts &&
              invoice.total_pretax_credit_amounts.length > 0 && (
                <TableRow>
                  <TableCell className='text-right' colSpan={3}>
                    {t('dashboard.invoice.credits_applied')}
                  </TableCell>
                  <TableCell className='text-right'>
                    -
                    {formatPrice(
                      invoice.total_pretax_credit_amounts.reduce(
                        (total, credit) => total + credit.amount,
                        0,
                      ),
                      settings?.language,
                      settings?.currency,
                    )}
                  </TableCell>
                </TableRow>
              )}
            {invoice?.total_taxes && invoice.total_taxes.length > 0 && (
              <TableRow>
                <TableCell className='text-right' colSpan={3}>
                  {t('dashboard.invoice.tax')} (
                  {(() => {
                    const totalTaxAmount = invoice.total_taxes.reduce(
                      (sum: number, tax) => sum + tax.amount,
                      0,
                    );
                    const totalTaxableAmount = invoice.total_taxes.reduce(
                      (sum: number, tax) => sum + (tax.taxable_amount || 0),
                      0,
                    );
                    const percentage =
                      totalTaxableAmount > 0
                        ? (totalTaxAmount / totalTaxableAmount) * 100
                        : 0;

                    return percentage.toFixed(2);
                  })()}
                  %)
                </TableCell>
                <TableCell className='text-right'>
                  {formatPrice(
                    invoice.total_taxes.reduce(
                      (sum: number, tax) => sum + tax.amount,
                      0,
                    ),
                    settings?.language,
                    settings?.currency,
                  )}
                </TableCell>
              </TableRow>
            )}
            <TableRow>
              <TableCell className='text-right font-bold' colSpan={3}>
                {t('dashboard.invoice.total')}
              </TableCell>
              <TableCell className='text-right font-bold'>
                {formatPrice(
                  invoice?.amount_due ?? 0,
                  settings?.language,
                  settings?.currency,
                )}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}

export default PreviewInvoice;
