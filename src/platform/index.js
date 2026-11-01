/**
 * Which shell is running the app.
 *
 * The same React code is packaged three ways:
 * - `web`     — the Vite build served from GitHub Pages (and the PWA);
 * - `desktop` — the Tauri build (`vite build --mode desktop`);
 * - `mobile`  — the Capacitor iOS build (`vite build --mode mobile`).
 *
 * The mode is read on every call instead of being captured at module load so
 * tests can switch runtime with `vi.stubEnv("MODE", ...)`.
 */

export const WEB = "web";
export const DESKTOP = "desktop";
export const MOBILE = "mobile";

/** @returns {"web"|"desktop"|"mobile"} */
export const runtime = () => {
  const mode = import.meta.env.MODE;
  if (mode === DESKTOP) return DESKTOP;
  if (mode === MOBILE) return MOBILE;
  return WEB;
};

export const isWeb = () => runtime() === WEB;
export const isDesktop = () => runtime() === DESKTOP;
export const isMobile = () => runtime() === MOBILE;

/** True in the packaged shells, where native plugins are available. */
export const isNativeShell = () => !isWeb();

/**
 * Mac App Store builds (`VITE_APP_STORE=1`). They must not self-update:
 * guideline 2.4.5 requires updates to go through the App Store, and the
 * sandbox blocks in-place replacement of the bundle anyway.
 */
export const isStoreBuild = () => import.meta.env.VITE_APP_STORE === "1";
