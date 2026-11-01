/** Language persisted by the app (also written by older versions). */
export const LANGUAGE_STORAGE_KEY = "appLanguage";
const LEGACY_KEY = "i18nextLng";

const normalize = (value) => (String(value || "").toLowerCase().startsWith("en") ? "en" : "it");

/** Stored choice first, then the browser preference; Italian is the default. */
export const detectLanguage = () => {
  if (typeof window === "undefined") return "it";
  try {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY) || window.localStorage.getItem(LEGACY_KEY);
    if (saved) return normalize(saved);
  } catch {
    // Storage can be unavailable in private browsing: fall back to navigator.
  }
  const navigatorLanguage = window.navigator?.languages?.[0] || window.navigator?.language;
  return normalize(navigatorLanguage);
};

export const persistLanguage = (language) => {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalize(language));
    // The old detector key would otherwise win over the stored choice.
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Nothing to persist without storage.
  }
};
