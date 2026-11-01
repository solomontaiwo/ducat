import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { setMoneyLanguage } from './formatCurrency.jsx';

import translationEN from '../locales/en/translation.json';
import translationIT from '../locales/it/translation.json';

const resources = {
  en: { translation: translationEN },
  it: { translation: translationIT },
};

// This will detect the user's language and fallback to english if not found
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'it'],
    interpolation: {
      escapeValue: false, // React already escapes by default
    },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
  });

const syncDocumentLanguage = (language) => {
  document.documentElement.lang = language?.startsWith('it') ? 'it' : 'en';
  setMoneyLanguage(language);
};

syncDocumentLanguage(i18n.resolvedLanguage || i18n.language);
i18n.on('languageChanged', syncDocumentLanguage);

export default i18n;
