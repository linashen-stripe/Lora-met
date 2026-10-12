/**
 * Convert internal language codes to Stripe-supported locales
 * @param lang - Language code from the app (en, en-GB, de, es, fr, it, ja)
 * @returns Stripe-compatible locale string
 */
export const getStripeLocale = (
  lang: string,
):
  | 'auto'
  | 'bg'
  | 'cs'
  | 'da'
  | 'de'
  | 'el'
  | 'en'
  | 'en-GB'
  | 'es'
  | 'es-419'
  | 'et'
  | 'fi'
  | 'fr'
  | 'fr-CA'
  | 'hr'
  | 'hu'
  | 'id'
  | 'it'
  | 'ja'
  | 'ko'
  | 'lt'
  | 'lv'
  | 'ms'
  | 'mt'
  | 'nb'
  | 'nl'
  | 'pl'
  | 'pt'
  | 'pt-BR'
  | 'ro'
  | 'ru'
  | 'sk'
  | 'sl'
  | 'sv'
  | 'th'
  | 'tr'
  | 'vi'
  | 'zh'
  | 'zh-HK'
  | 'zh-TW' => {
  const supportedLocales = [
    'en',
    'en-GB',
    'de',
    'es',
    'fr',
    'it',
    'ja',
  ] as const;
  return supportedLocales.includes(lang as any) ? (lang as any) : 'en';
};
