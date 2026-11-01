/**
 * Adds the English translations to an i18next instance. The bundle is imported
 * on demand so it stays out of the initial payload; safe to call repeatedly.
 */
export const loadEnglish = async (i18nInstance) => {
  const alreadyLoaded = i18nInstance?.hasResourceBundle?.("en", "translation");
  if (alreadyLoaded) return;
  const { default: translationEN } = await import("../locales/en/translation.json");
  i18nInstance?.addResourceBundle?.("en", "translation", translationEN, true, true);
};
