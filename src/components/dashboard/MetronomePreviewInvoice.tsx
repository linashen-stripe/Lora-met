import { Fragment } from 'react';
import { formatPrice } from '@/utils/helpers';
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
import { useConfigContext } from '@/contexts/ConfigContext';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { MetronomeInvoice, MetronomeInvoiceLineItem } from '@/utils/types';
import { isAppliedCommitOrCreditLineItem } from '@/utils/metronomeInvoice';

function dimensionEntries(
  values: Record<string, string> | undefined,
): [string, string][] {
  if (!values || typeof values !== 'object') return [];
  return Object.entries(values).map(([k, v]) => [k, v == null ? '' : String(v)]);
}

/** Stable key so line items with the same presentation dimensions group together. */
function presentationGroupSortKey(
  l: MetronomeInvoiceLineItem,
): string {
  const entries = dimensionEntries(l.presentation_group_values);
  if (entries.length === 0) return '';
  return entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('|');
}

type ChargeLine = MetronomeInvoiceLineItem & { id?: string };

function buildPresentationGroups(items: ChargeLine[]): {
  reactKey: string;
  hasPresentation: boolean;
  presentationChips: [string, string][];
  lines: ChargeLine[];
}[] {
  const map = new Map<string, ChargeLine[]>();
  for (const l of items) {
    const k = presentationGroupSortKey(l);
    const list = map.get(k) ?? [];
    list.push(l);
    map.set(k, list);
  }
  const keys = [...map.keys()].sort((a, b) => {
    if (a === '') return 1;
    if (b === '') return -1;
    return a.localeCompare(b);
  });
  return keys.map((k) => {
    const lines = map.get(k)!;
    const hasPresentation = k !== '';
    const presentationChips = hasPresentation
      ? dimensionEntries(lines[0]?.presentation_group_values)
      : [];
    return {
      reactKey: k || 'ungrouped',
      hasPresentation,
      presentationChips,
      lines,
    };
  });
}

function translateLineItemName(name: string | undefined | null, t: TFunction): string {
  if (!name) return '';
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return t(`dashboard.invoice.line_item_names.${slug}`, { defaultValue: name });
}

function creditTypeNameToCurrency(name: string): string {
  const match = name.match(/^([A-Z]+)/);
  return match ? match[1].toLowerCase() : 'usd';
}

function formatBillingPeriod(invoice: MetronomeInvoice, language: string): string {
  if (!invoice.end_timestamp) return '';
  return new Date(invoice.end_timestamp).toLocaleDateString(language, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function MetronomePreviewInvoice({
  invoice,
  isLoading = false,
}: {
  invoice: MetronomeInvoice | null;
  isLoading?: boolean;
}) {
  const { settings } = useConfigContext();
  const { t } = useTranslation();
  const language = settings?.language || 'en';

  if (isLoading) {
    return (
      <Card className='mt-4 bg-white text-gray-900'>
        <CardHeader>
          <CardTitle>{t('dashboard.invoice.upcoming_title')}</CardTitle>
          <CardDescription>{t('dashboard.invoice.billing_period_ending')}</CardDescription>
          <div className='pt-4 space-y-2'>
            <Skeleton className='h-10 w-44' />
            <Skeleton className='h-4 w-full max-w-md' />
          </div>
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
                  <TableCell><Skeleton className='h-4 w-32' /></TableCell>
                  <TableCell><Skeleton className='h-4 w-16' /></TableCell>
                  <TableCell><Skeleton className='h-4 w-20' /></TableCell>
                  <TableCell className='text-right'><Skeleton className='h-4 w-20' /></TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className='text-right font-bold' colSpan={3}>{t('dashboard.invoice.total')}</TableCell>
                <TableCell className='text-right font-bold'><Skeleton className='h-4 w-20' /></TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    );
  }

  if (!invoice) {
    return (
      <Card className='mt-4 bg-white text-gray-900'>
        <CardHeader>
          <CardTitle>{t('dashboard.invoice.upcoming_title')}</CardTitle>
          <CardDescription>{t('dashboard.invoice.no_upcoming_charges')}</CardDescription>
          <div className='pt-4'>
            <p className='text-4xl font-bold tabular-nums tracking-tight text-gray-900'>
              {formatPrice(0, language, settings?.currency || 'usd')}
            </p>
            <p className='mt-2 text-sm text-gray-600'>
              {t('dashboard.invoice.period_net_subtitle_empty')}
            </p>
          </div>
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
              <TableRow>
                <TableCell className='font-medium text-gray-500' colSpan={4}>
                  {t('dashboard.invoice.no_charges')}
                </TableCell>
              </TableRow>
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className='text-right font-bold' colSpan={3}>{t('dashboard.invoice.total')}</TableCell>
                <TableCell className='text-right font-bold'>
                  {formatPrice(0, language, settings?.currency || 'usd')}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    );
  }

  const currency = creditTypeNameToCurrency(invoice.credit_type?.name ?? 'USD');
  const lineItems = (invoice as any).line_items ?? [];

  // Separate credits-applied line items (negative totals) from charge line items
  const chargeItems = lineItems.filter(
    (l: any) => !isAppliedCommitOrCreditLineItem(l.type),
  );
  const creditItems = lineItems.filter((l: any) =>
    isAppliedCommitOrCreditLineItem(l.type),
  );
  const creditsApplied = creditItems.reduce((sum: number, l: any) => sum + (l.total ?? 0), 0);

  // Subtotal is sum of charge line items
  const subtotal = chargeItems.reduce((sum: number, l: any) => sum + (l.total ?? 0), 0);

  const chargeLines = chargeItems as ChargeLine[];
  const presentationGroups = buildPresentationGroups(chargeLines);
  const multiplePresentationBuckets = presentationGroups.length > 1;

  return (
    <Card className='mt-4 bg-white text-gray-900'>
      <CardHeader>
        <CardTitle>{t('dashboard.invoice.upcoming_title')}</CardTitle>
        <CardDescription>
          {t('dashboard.invoice.billing_period_ending')}{' '}
          {formatBillingPeriod(invoice, language)}
        </CardDescription>
        <div className='pt-4'>
          <p className='text-4xl font-bold tabular-nums tracking-tight text-gray-900'>
            {formatPrice(invoice.total, language, currency)}
          </p>
          <p className='mt-2 text-sm text-gray-600'>
            {t('dashboard.invoice.period_net_subtitle')}
          </p>
        </div>
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
            {chargeItems.length > 0 ? (
              presentationGroups.map((group) => (
                <Fragment key={group.reactKey}>
                  {group.hasPresentation ? (
                    <TableRow className='bg-violet-50/80 hover:bg-violet-50/80'>
                      <TableCell colSpan={4} className='py-2.5'>
                        <p className='text-sm leading-snug text-violet-900'>
                          <span className='font-medium'>
                            {t('dashboard.invoice.usage_per_heading')}
                          </span>{' '}
                          <span className='font-mono text-xs text-violet-900/90 break-words'>
                            {[...group.presentationChips]
                              .sort(([a], [b]) => a.localeCompare(b))
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(' · ')}
                          </span>
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : multiplePresentationBuckets ? (
                    <TableRow className='bg-gray-50/90 hover:bg-gray-50/90'>
                      <TableCell
                        colSpan={4}
                        className='py-2 text-xs font-medium text-gray-600'
                      >
                        {t('dashboard.invoice.ungrouped_line_items')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {group.lines.map((l, i) => {
                    const pricingKeys = dimensionEntries(l.pricing_group_values);
                    return (
                      <TableRow key={l.id ?? `${group.reactKey}-${i}`}>
                        <TableCell className='font-medium'>
                          <div>{translateLineItemName(l.name, t)}</div>
                          {pricingKeys.length > 0 && (
                            <div className='mt-1 flex flex-wrap gap-1'>
                              {pricingKeys.map(([k, v]) => (
                                <span
                                  key={k}
                                  className='inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600'
                                >
                                  {k}: {v}
                                </span>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {l.quantity != null
                            ? l.quantity.toLocaleString(language)
                            : '—'}
                        </TableCell>
                        <TableCell>
                          {l.unit_price != null
                            ? formatPrice(l.unit_price, language, currency)
                            : '—'}
                        </TableCell>
                        <TableCell className='text-right'>
                          {formatPrice(l.total ?? 0, language, currency)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </Fragment>
              ))
            ) : (
              <TableRow>
                <TableCell className='font-medium text-gray-500' colSpan={4}>
                  {t('dashboard.invoice.no_charges')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          <TableFooter>
            {chargeItems.length > 0 && (
              <TableRow>
                <TableCell className='text-right' colSpan={3}>{t('dashboard.invoice.subtotal')}</TableCell>
                <TableCell className='text-right'>
                  {formatPrice(subtotal, language, currency)}
                </TableCell>
              </TableRow>
            )}
            {creditsApplied < 0 && (
              <TableRow>
                <TableCell className='text-right' colSpan={3}>{t('dashboard.invoice.credits_applied')}</TableCell>
                <TableCell className='text-right'>
                  -{formatPrice(Math.abs(creditsApplied), language, currency)}
                </TableCell>
              </TableRow>
            )}
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}
