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

export const dismissKeyboardOnEnter = (event) => {
  if (
    runtime() !== MOBILE || document.documentElement.dataset.host === "macos"
    || event.key !== "Enter" || event.metaKey || event.ctrlKey || event.nativeEvent.isComposing
  ) return;

  event.preventDefault();
  event.currentTarget.blur();
};

/**
 * @param {object} [options]
 * @param {() => void} [options.onActive]   app came back to the foreground
 * @param {() => void} [options.onInactive] app went to the background
 */
export const startNativeShell = async ({ onActive, onInactive } = {}) => {
  if (runtime() !== MOBILE) return () => {};

  const cleanups = [];
  if (document.documentElement.dataset.host !== "macos") {
    let frame;
    const revealFocusedField = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const field = document.activeElement;
        if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field?.isContentEditable)) return;

        // Use the scrollable form's own edges so a pinned footer cannot cover the field.
        for (let parent = field.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
          const { overflowY } = getComputedStyle(parent);
          if (overflowY !== "auto" && overflowY !== "scroll") continue;
          if (parent.scrollHeight <= parent.clientHeight) continue;

          const fieldRect = field.getBoundingClientRect();
          const top = parent.getBoundingClientRect().top + parent.clientTop;
          const bottom = top + parent.clientHeight;
          if (fieldRect.bottom > bottom) parent.scrollTop += fieldRect.bottom - bottom + 8;
          else if (fieldRect.top < top) parent.scrollTop += fieldRect.top - top - 8;
        }
        const fieldRect = field.getBoundingClientRect();
        if (fieldRect.top < 0 || fieldRect.bottom > window.innerHeight) {
          field.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
      });
    };
    window.addEventListener("resize", revealFocusedField);
    cleanups.push(() => {
      window.removeEventListener("resize", revealFocusedField);
      cancelAnimationFrame(frame);
    });
  }

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

    let hidden = false;
    const hideSplash = () => {
      if (hidden) return;
      hidden = true;
      SplashScreen.hide({ fadeDuration: 150 }).catch(() => {});
    };
    if (window.__ducatReady) {
      hideSplash();
    } else {
      const fallback = window.setTimeout(hideSplash, 1800);
      const onReady = () => {
        window.clearTimeout(fallback);
        hideSplash();
      };
      window.addEventListener("ducat:ready", onReady, { once: true });
      cleanups.push(() => {
        window.clearTimeout(fallback);
        window.removeEventListener("ducat:ready", onReady);
      });
    }
  } catch {
    // A missing plugin must never break the app: the UI is already mounted.
  }

  return () => cleanups.forEach((cleanup) => cleanup());
};
