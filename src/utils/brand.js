/**
 * The product name in one place.
 *
 * The user-visible name also lives in the shell configs (Tauri, Capacitor,
 * Xcode) and in the translation files, because those are read before React
 * starts; `tests/appStoreConfig.test.js` keeps them aligned. This module is for
 * the code that needs the name without importing i18n.
 */
export const APP_NAME = "Ducat";

/** Filesystem-safe form, used in exported file names. */
export const APP_SLUG = "ducat";
