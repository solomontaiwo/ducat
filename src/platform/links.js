/**
 * Opening a public link outside the app shell.
 *
 * - mobile: the system browser (SFSafariViewController via Capacitor), because
 *   a plain `window.open` inside WKWebView is blocked or opens in-app with no
 *   way back to the app;
 * - desktop: the Tauri opener plugin, which hands the URL to the OS;
 * - web: a normal new tab.
 */

import { DESKTOP, MOBILE, runtime } from "./index.js";

const ALLOWED_PROTOCOLS = new Set(["https:", "http:", "mailto:"]);

export const isAllowedExternalUrl = (value) => {
  try {
    return ALLOWED_PROTOCOLS.has(new URL(String(value)).protocol);
  } catch {
    return false;
  }
};

export const openExternal = async (url) => {
  const target = String(url ?? "");
  if (!isAllowedExternalUrl(target)) {
    throw new Error("Unsupported external link");
  }

  const current = runtime();

  if (current === MOBILE) {
    if (target.startsWith("mailto:")) {
      window.location.href = target;
      return;
    }
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: target });
    return;
  }

  if (current === DESKTOP) {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(target);
      return;
    } catch {
      // Fall through to the web behaviour if the plugin is unavailable.
    }
  }

  window.open(target, "_blank", "noopener,noreferrer");
};
