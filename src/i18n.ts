import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { supportedLanguages, defaultDemoSettings } from './config/config';
import en from '../public/locales/en.json';
import fr from '../public/locales/fr.json';
import es from '../public/locales/es.json';
import de from '../public/locales/de.json';
import ja from '../public/locales/ja.json';
import it from '../public/locales/it.json';
import enGB from '../public/locales/en-GB.json';
import zh from '../public/locales/zh.json';

i18n.use(initReactI18next).init({
  fallbackLng: 'en',
  supportedLngs: supportedLanguages,
  // debug: process.env.NODE_ENV === 'development',
  interpolation: {
    escapeValue: false,
  },
  resources: {
    en: {
      translation: en,
    },
    fr: {
      translation: fr,
    },
    es: {
      translation: es,
    },
    de: {
      translation: de,
    },
    ja: {
      translation: ja,
    },
    it: {
      translation: it,
    },
    'en-GB': {
      translation: enGB,
    },
    zh: {
      translation: zh,
    },
  },
});

export default i18n;
