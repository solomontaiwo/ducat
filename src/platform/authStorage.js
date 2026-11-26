/**
 * Where Supabase keeps the session on each shell.
 *
 * The web and desktop builds use the default `localStorage`. On iOS the
 * WKWebView storage can be evicted under disk pressure, which silently signs
 * the user out, so the mobile build keeps the session in the native
 * preferences store (UserDefaults) through Capacitor.
 *
 * The adapter is asynchronous, which Supabase accepts for every storage call.
 */

import { Preferences } from "@capacitor/preferences";
import { MOBILE, runtime } from "./index.js";
import { readLocalValue } from "../utils/storage.js";

export const nativeAuthStorage = {
  async getItem(key) {
    const { value } = await Preferences.get({ key });
    return value ?? null;
  },
  async setItem(key, value) {
    await Preferences.set({ key, value });
  },
  async removeItem(key) {
    await Preferences.remove({ key });
  },
};

/** The `auth.storage` option for `createClient`, or `undefined` on web/desktop. */
export const authStorage = () => (runtime() === MOBILE ? nativeAuthStorage : undefined);

/**
 * Checks whether a persisted auth session exists on the active shell's storage
 * (`@capacitor/preferences` on iOS, `localStorage` on web and desktop).
 */
export const hasStoredAuthSession = async (key) => {
  if (runtime() === MOBILE) {
    try {
      return Boolean(await nativeAuthStorage.getItem(key));
    } catch {
      return false;
    }
  }
  return Boolean(readLocalValue(key));
};
