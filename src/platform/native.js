/**
 * One-time bootstrap for the native shells.
 *
 * Only the mobile shell needs work here: the status bar has to follow the app
 * theme, the splash screen has to stay up until React has rendered, and the
 * auth timer has to pause while the app is in the background (iOS suspends
 * timers, so a token refresh would otherwise fire late and fail).
 *
 * The function is a no-op on the web and on the desktop.
 */

import { MOBILE, runtime } from "./index.js";

const darkMode = () => document.documentElement.classList.contains("dark");

/**
 * @param {object} [options]
 * @param {() => void} [options.onActive]   app came back to the foreground
 * @param {() => void} [options.onInactive] app went to the background
 */
export const startNativeShell = async ({ onActive, onInactive } = {}) => {
  if (runtime() !== MOBILE) return () => {};

  const cleanups = [];

  try {
    const [{ StatusBar, Style }, { SplashScreen }, { App }] = await Promise.all([
      import("@capacitor/status-bar"),
      import("@capacitor/splash-screen"),
      import("@capacitor/app"),
    ]);

    const applyStyle = () => {
      StatusBar.setStyle({ style: darkMode() ? Style.Dark : Style.Light }).catch(() => {});
    };
    applyStyle();

    // The theme provider toggles the `dark` class on <html>; keep the system
    // status bar in sync with it.
    const observer = new MutationObserver(applyStyle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    cleanups.push(() => observer.disconnect());

    const listener = await App.addListener("appStateChange", ({ isActive }) => {
      try {
        (isActive ? onActive : onInactive)?.();
      } catch {
        // A listener error must never break the shell.
      }
    });
    cleanups.push(() => listener.remove());

    await SplashScreen.hide({ fadeDuration: 150 });
  } catch {
    // A missing plugin must never break the app: the UI is already mounted.
  }

  return () => cleanups.forEach((cleanup) => cleanup());
};
