/**
 * Format dates according to regional conventions for global compliance
 * - US: MM/DD/YYYY, Month Day, Year
 * - Europe: DD/MM/YYYY, Day Month Year
 * - Japan: YYYY/MM/DD, Year Month Day
 * - UK: DD/MM/YYYY, Day Month Year
 */

interface DateFormatOptions {
  includeTime?: boolean;
  timeFormat?: '12h' | '24h';
}

/**
 * Get the appropriate locale string for date formatting based on language
 */
const getDateLocale = (language: string): string => {
  const localeMap: Record<string, string> = {
    en: 'en-US', // US format: MM/DD/YYYY
    'en-GB': 'en-GB', // UK format: DD/MM/YYYY
    de: 'de-DE', // German format: DD.MM.YYYY
    es: 'es-ES', // Spanish format: DD/MM/YYYY
    fr: 'fr-FR', // French format: DD/MM/YYYY
    it: 'it-IT', // Italian format: DD/MM/YYYY
    ja: 'ja-JP', // Japanese format: YYYY/MM/DD
  };
  return localeMap[language] || 'en-US';
};

/**
 * Format a timestamp according to regional date conventions
 * @param timestamp - Unix timestamp in seconds
 * @param language - User's language preference
 * @param format - Date format style
 * @param options - Additional formatting options
 */
export const formatDateByLocale = (
  timestamp: number,
  language: string = 'en',
  format: 'short' | 'medium' | 'long' = 'short',
  options: DateFormatOptions = {},
): string => {
  const date = new Date(timestamp * 1000);
  const locale = getDateLocale(language);

  switch (format) {
    case 'short':
      // Short format: Regional numeric date
      return date.toLocaleDateString(locale);

    case 'medium':
      // Medium format: Month name with day/year in regional order
      return date.toLocaleDateString(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

    case 'long':
      // Long format: Full date with optional time
      const dateOptions: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
      };

      if (options.includeTime) {
        dateOptions.hour = '2-digit';
        dateOptions.minute = '2-digit';
        dateOptions.hour12 = options.timeFormat === '12h';
      }

      return date.toLocaleDateString(locale, dateOptions);

    default:
      return date.toLocaleDateString(locale);
  }
};

/**
 * Format a JavaScript Date object according to regional conventions
 * @param date - JavaScript Date object
 * @param language - User's language preference
 * @param format - Date format style
 * @param options - Additional formatting options
 */
export const formatDate = (
  date: Date,
  language: string = 'en',
  format: 'short' | 'medium' | 'long' = 'short',
  options: DateFormatOptions = {},
): string => {
  const timestamp = Math.floor(date.getTime() / 1000);
  return formatDateByLocale(timestamp, language, format, options);
};

/**
 * Regional date format examples for reference:
 *
 * For date: October 15, 2024
 *
 * US (en):     10/15/2024
 * UK (en-GB):  15/10/2024
 * German (de): 15.10.2024
 * Spanish (es): 15/10/2024
 * French (fr):  15/10/2024
 * Italian (it): 15/10/2024
 * Japanese (ja): 2024/10/15
 */
