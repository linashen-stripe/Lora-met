import { supportedLanguages } from '@/config/config';
import { Mock } from '@demoeng/utils/mock';

export interface CartItem {
  id: string;
  type: string;
  details?: any;
  quantity?: number;
  price?: number;
}

// adds defaults
export function formatPrice(
  amount: number | null,
  language?: string,
  currency?: string,
  fallbackText: string = 'Loading',
) {
  if (amount === null) {
    return fallbackText;
  }

  return new Intl.NumberFormat(language || 'en', {
    style: 'currency',
    currency: currency?.toLowerCase() || 'usd',
  }).format(amount / ((currency?.toLowerCase() || 'usd') === 'jpy' ? 1 : 100));
}

export function generateRandomCustomerToken() {
  return `CUST_${Math.random().toString(36).slice(2, 11)}`;
}

const removeAccents = (str: string) =>
  str.normalize('NFD').replace(/[̀-ͯ]/g, '');

const SUPPLEMENTAL_FIRST_NAMES = [
  'Avery', 'Camila', 'Darius', 'Elena', 'Felix', 'Hana', 'Imani', 'Jonah',
  'Leila', 'Mateo', 'Nadia', 'Owen', 'Priya', 'Rafael', 'Talia', 'Zane',
] as const;

const SUPPLEMENTAL_LAST_NAMES = [
  'Bennett', 'Castillo', 'Desai', 'Fischer', 'Gupta', 'Haddad', 'Ito', 'Kim',
  'Laurent', 'Moreno', 'Novak', 'Okafor', 'Park', 'Rahman', 'Silva', 'Vega',
] as const;

export function generateRandomCustomerEmail(countryCode = 'US') {
  const mock = new Mock({ country: countryCode as any });
  const generated = mock.individualNames();
  const useSupplementalFirst = Math.random() < 0.5;
  const useSupplementalLast = Math.random() < 0.5;
  const first_name = useSupplementalFirst
    ? SUPPLEMENTAL_FIRST_NAMES[
        Math.floor(Math.random() * SUPPLEMENTAL_FIRST_NAMES.length)
      ]
    : generated.first_name;
  const last_name = useSupplementalLast
    ? SUPPLEMENTAL_LAST_NAMES[
        Math.floor(Math.random() * SUPPLEMENTAL_LAST_NAMES.length)
      ]
    : generated.last_name;
  const first = removeAccents(first_name).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const last = removeAccents(last_name).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${first}.${last}${suffix}@example.com`;
}

export function deriveCustomerNameFromEmail(email: string): string {
  // Parse "marie.dupont4827@example.com" → "Marie Dupont"
  const parts = email.split('@')[0].split('.');
  return parts.map(p => {
    const clean = p.replace(/\d+$/, '');
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }).join(' ');
}

export function calculateOrderAmount(
  items: CartItem[],
  shippingCost: number,
  discount: number,
) {
  const subtotal = items.reduce((total: number, item: CartItem) => {
    if (typeof item.price !== 'number' || typeof item.quantity !== 'number') {
      throw new Error('Invalid item price or quantity');
    }
    return total + item.price * item.quantity;
  }, 0);
  return Math.max(0, subtotal + shippingCost - discount);
}

export function changeHexColor(baseColor: string): string {
  // Helper function to calculate brightness
  function getBrightness(hex: string): number {
    const rgb = parseInt(hex.replace('#', ''), 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = (rgb >> 0) & 0xff;
    return (r * 299 + g * 587 + b * 114) / 1000;
  }

  // Helper function to adjust color
  function adjustColor(color: string, amount: number): string {
    const clamp = (value: number) => Math.max(0, Math.min(255, value));

    color = color.replace(/^#/, '');
    let r = parseInt(color.slice(0, 2), 16);
    let g = parseInt(color.slice(2, 4), 16);
    let b = parseInt(color.slice(4, 6), 16);

    r = clamp(r + amount);
    g = clamp(g + amount);
    b = clamp(b + amount);

    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  const brightness = getBrightness(baseColor);
  const threshold = 128; // Midpoint of brightness range (0-255)
  const adjustmentAmount = 30; // Amount to lighten or darken

  if (brightness > threshold) {
    // If the color is bright, darken it for hover
    return adjustColor(baseColor, -adjustmentAmount);
  } else {
    // If the color is dark, lighten it for hover
    return adjustColor(baseColor, adjustmentAmount);
  }
}

export function getTextColor(backgroundColor?: string | null) {
  if (!backgroundColor) {
    return '#FFFFFF';
  }
  // Convert hex to RGB
  let hex = backgroundColor.replace('#', '');

  // Handle 3-character hex codes (e.g., #fff → #ffffff)
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // Return black for bright backgrounds, white for dark
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

export function getLuminance(hex: string): number {
  if (!hex) {
    return 0;
  }
  const color = hex.replace('#', '');
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance;
}

/**
 * Gets the primary foreground color for a theme.
 * Returns a specific dark gray for light backgrounds for a softer look.
 * @param backgroundColor The base background color of the theme.
 * @returns The appropriate foreground color ('#222222' or '#FFFFFF').
 */
export function getForegroundColor(backgroundColor: string) {
  if (!backgroundColor) {
    return '#222222';
  }
  const luminance = getLuminance(backgroundColor);
  // For light backgrounds, return a dark gray instead of pure black
  return luminance > 0.5 ? '#222222' : '#FFFFFF';
}

export function hexToHSL(hex: string): string | null {
  if (!hex) {
    return null;
  }
  // Convert hex to RGB
  let r = 0,
    g = 0,
    b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.substring(1, 3), 16);
    g = parseInt(hex.substring(3, 5), 16);
    b = parseInt(hex.substring(5, 7), 16);
  } else {
    return null; // Invalid hex code
  }

  // Convert RGB to HSL
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0,
    s = 0,
    l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  h = Math.round(h * 360);
  s = Math.round(s * 100);
  l = Math.round(l * 100);

  return `${h} ${s}% ${l}%`;
}
export function extractLocale(url: string) {
  const parsedUrl = new URL(url);
  const pathSegments = parsedUrl.pathname
    .split('/')
    .filter((segment) => segment);

  if (pathSegments.length > 0 && supportedLanguages.includes(pathSegments[0])) {
    return pathSegments[0];
  }

  return null;
}

export function calculateBillingPeriod(
  creationDateString: string,
  interval: 'month' | 'week' | 'year',
) {
  const creationDate = new Date(creationDateString);
  const currentDate = new Date();
  let periodStart = new Date(creationDate);
  let periodEnd = new Date(creationDate);

  // Cycle through periods until we find the most recent one
  while (true) {
    periodStart = new Date(periodEnd);
    periodEnd = new Date(periodStart);

    // Adjust period end based on interval
    switch (interval) {
      case 'week':
        periodEnd.setDate(periodEnd.getDate() + 7);
        break;
      case 'month':
        periodEnd.setMonth(periodEnd.getMonth() + 1);
        break;
      case 'year':
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        break;
      default:
        throw new Error(`Unsupported interval: ${interval}`);
    }

    // If the next period end is in the future, we've found our current period
    if (periodEnd > currentDate) {
      // Convert to Unix timestamps
      const periodStartTimestamp = Math.floor(periodStart.getTime() / 1000);
      const periodEndTimestamp = Math.floor(periodEnd.getTime() / 1000);

      return {
        startRange: periodStartTimestamp,
        endRange: periodEndTimestamp,
      };
    }
  }
}

// Format currency based on rate card currency
export const formatCurrency = (amount: string, currency = 'usd', language = 'en') => {
  const numAmount = parseFloat(amount) / 100; // Stripe amounts are in cents
  return new Intl.NumberFormat(language, {
    style: 'currency',
    currency: currency.toLowerCase(),
    minimumFractionDigits: 2,
  }).format(numAmount);
};

/**
 * Format a Unix timestamp into a user-friendly date string with regional compliance
 * @param timestamp - Unix timestamp in seconds
 * @param format - Format style ('short', 'medium', 'long', or custom pattern)
 * @param language - Language/locale for regional date formatting (e.g., 'de', 'en', 'ja')
 * @returns Formatted date string in regional format
 */
export function formatTimestamp(
  timestamp: number,
  format: 'short' | 'medium' | 'long' | string = 'short',
  language: string = 'en',
): string {
  // Convert Unix timestamp (seconds) to JavaScript Date
  const date = new Date(timestamp * 1000);

  // Map language codes to proper locales for regional date formats
  const getLocale = (lang: string): string => {
    const localeMap: Record<string, string> = {
      en: 'en-US', // US: MM/DD/YYYY
      'en-GB': 'en-GB', // UK: DD/MM/YYYY
      de: 'de-DE', // German: DD.MM.YYYY
      es: 'es-ES', // Spanish: DD/MM/YYYY
      fr: 'fr-FR', // French: DD/MM/YYYY
      it: 'it-IT', // Italian: DD/MM/YYYY
      ja: 'ja-JP', // Japanese: YYYY/MM/DD
    };
    return localeMap[lang] || 'en-US';
  };

  const locale = getLocale(language);

  // Format based on requested style with regional compliance
  switch (format) {
    case 'short':
      // Regional numeric format (DD/MM/YYYY for EU, MM/DD/YYYY for US, etc.)
      return date.toLocaleDateString(locale);

    case 'medium':
      // Regional format with month name
      return date.toLocaleDateString(locale, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });

    case 'long':
      // Regional format with full details
      return date.toLocaleDateString(locale, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

    default:
      // If custom format string is provided (basic implementation)
      if (typeof format === 'string') {
        // Very simple custom formatter
        return format
          .replace('MM', String(date.getMonth() + 1).padStart(2, '0'))
          .replace('M', String(date.getMonth() + 1))
          .replace('DD', String(date.getDate()).padStart(2, '0'))
          .replace('D', String(date.getDate()))
          .replace('YYYY', String(date.getFullYear()))
          .replace('YY', String(date.getFullYear()).slice(2));
      }
      return date.toLocaleDateString(locale);
  }
}

/**
 * Get the translation key for an invoice status
 * @param status - Stripe invoice status
 * @param t - Translation function from react-i18next
 * @returns Translated status string
 */
export function getInvoiceStatusTranslation(
  status: string | null | undefined,
  t: (key: string) => string,
): string {
  if (!status) return '';

  const statusMap: Record<string, string> = {
    draft: 'settings.invoices.draft',
    open: 'settings.invoices.open',
    paid: 'settings.invoices.paid',
    void: 'settings.invoices.void',
    uncollectible: 'settings.invoices.uncollectible',
  };

  const translationKey = statusMap[status.toLowerCase()];
  return translationKey ? t(translationKey) : status.toUpperCase();
}
