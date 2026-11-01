import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import translationIT from '../locales/it/translation.json';
import { setMoneyLanguage } from './formatCurrency.jsx';
import { detectLanguage, persistLanguage } from './language.js';
import { loadEnglish } from './loadEnglish.js';

// Italian is bundled with the app: it is the fallback and the most common
// choice. English is a separate chunk, fetched only when it is needed, which
// keeps the initial bundle well under the CI budget.
const resources = {
  it: { translation: translationIT },
};

i18n.use(initReactI18next).init({
  resources,
  lng: 'it',
  fallbackLng: 'it',
  supportedLngs: ['it', 'en'],
  interpolation: {
    escapeValue: false, // React already escapes by default
  },
});

const syncLanguage = (language) => {
  document.documentElement.lang = language?.startsWith('it') ? 'it' : 'en';
  setMoneyLanguage(language);
};

/**
 * Applies the stored/browser language before the first render. Resolves even
 * if the English chunk cannot be loaded (the app then starts in Italian).
 */
export const ensureLanguage = async () => {
  const language = detectLanguage();
  try {
    if (language === 'en') await loadEnglish(i18n);
    if (i18n.resolvedLanguage !== language) await i18n.changeLanguage(language);
  } catch {
    // Offline or failed chunk: keep Italian and let the user switch later.
  }
  return i18n;
};

/** Switches language from the UI, loading English on demand. */
export const changeAppLanguage = async (language) => {
  const next = String(language).toLowerCase().startsWith('en') ? 'en' : 'it';
  if (next === 'en') await loadEnglish(i18n);
  await i18n.changeLanguage(next);
};

i18n.on('languageChanged', (language) => {
  syncLanguage(language);
  persistLanguage(language);
});

syncLanguage(i18n.language);

export default i18n;
