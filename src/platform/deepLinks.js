/**
 * Universal Links → in-app navigation.
 *
 * When iOS opens `https://<domain>/reset-password#access_token=…` because of
 * the associated-domains entitlement, Capacitor emits `appUrlOpen`. The app
 * must show that route with the fragment intact, so Supabase can pick the
 * session out of the URL. Reloading the SPA at the linked path is the simplest
 * way to get exactly that: the router starts on the right screen and the
 * Supabase client runs `detectSessionInUrl` again.
 */

import { MOBILE, runtime } from "./index.js";
import { buildQuickAddPath } from "../utils/quickAddDraft.js";

const DEFAULT_UNIVERSAL_LINK_HOSTS = new Set(["ducatapp.com", "www.ducatapp.com"]);

/**
 * Maps a Universal Link (or our custom scheme) to a same-origin path.
 * Returns null for anything that is not an app link.
 */
export const toInAppPath = (value) => {
  let parsed;
  try {
    parsed = new URL(String(value));
  } catch {
    return null;
  }

  const publicBase = import.meta.env.VITE_DESKTOP_WEB_URL;
  const allowedHosts = new Set();
  if (publicBase === undefined) {
    DEFAULT_UNIVERSAL_LINK_HOSTS.forEach((host) => allowedHosts.add(host));
  } else if (publicBase) {
    try {
      const host = new URL(publicBase).host;
      if (host) allowedHosts.add(host);
    } catch {
      // Invalid configured URL: leave allowedHosts empty.
    }
  }

  const isHttpLink = parsed.protocol === "https:" || parsed.protocol === "http:";
  const isCustomScheme = parsed.protocol === "ducat:";

  if (isHttpLink && !allowedHosts.has(parsed.host)) return null;
  if (!isHttpLink && !isCustomScheme) return null;

  const path = isCustomScheme
    ? `${parsed.host ? `/${parsed.host}` : ""}${parsed.pathname}`
    : parsed.pathname;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const cleanPath = normalized.replace(/^\/{2,}/, "/");
  if (cleanPath === "/quick-add" || cleanPath === "/quick-add/") {
    return buildQuickAddPath(parsed.searchParams);
  }
  return `${cleanPath}${parsed.search}${parsed.hash}`;
};

/** Listens for Universal Links. No-op outside the iOS shell. */
export const installDeepLinkHandler = async () => {
  if (runtime() !== MOBILE) return () => {};

  try {
    const { App } = await import("@capacitor/app");
    const listener = await App.addListener("appUrlOpen", ({ url }) => {
      const target = toInAppPath(url);
      if (target) window.location.assign(target);
    });
    return () => listener.remove();
  } catch {
    return () => {};
  }
};
