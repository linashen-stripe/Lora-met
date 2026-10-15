import { formatPrice } from '@/utils/helpers';

const FIAT_MINOR_UNIT_NAMES = /^([A-Z]{3})(?:\s*\((?:cents|minor units)\))?$/i;

export function metronomeCreditTypeCurrency(
  creditTypeName?: string | null,
): string | null {
  const match = creditTypeName?.trim().match(FIAT_MINOR_UNIT_NAMES);
  return match ? match[1].toLowerCase() : null;
}

export function isCustomMetronomeCreditType(
  creditTypeName?: string | null,
): boolean {
  return Boolean(
    creditTypeName && !metronomeCreditTypeCurrency(creditTypeName),
  );
}

export function formatMetronomeAmount(
  amount: number,
  creditTypeName: string | null | undefined,
  language = 'en',
  fallbackCurrency = 'usd',
): string {
  const currency = metronomeCreditTypeCurrency(creditTypeName);
  if (currency || !creditTypeName) {
    return formatPrice(amount, language, currency ?? fallbackCurrency);
  }

  const value = new Intl.NumberFormat(language, {
    maximumFractionDigits: 2,
  }).format(amount);
  return `${value} ${creditTypeName}`;
}
