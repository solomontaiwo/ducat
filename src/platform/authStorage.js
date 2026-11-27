/**
 * Where Supabase keeps the session on each shell.
 *
 * The web and desktop builds use the default `localStorage`. On iOS the
 * WKWebView storage can be evicted under disk pressure, so the mobile build
 * keeps tokens in the iOS Keychain (via `NativeFeaturesPlugin`), migrating any
 * legacy `@capacitor/preferences` entry automatically and falling back to
 * Preferences on older native shells without Keychain methods.
 */

import { registerPlugin } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { MOBILE, runtime } from "./index.js";
import { readLocalValue } from "../utils/storage.js";

let keychainPlugin = null;
const getKeychain = () => {
  if (runtime() !== MOBILE) return null;
  if (!keychainPlugin) keychainPlugin = registerPlugin("NativeFeatures");
  return keychainPlugin;
};

const isUnimplemented = (error) => {
  const code = String(error?.code || "").toUpperCase();
  return code === "UNIMPLEMENTED" || error instanceof TypeError;
};

export const nativeAuthStorage = {
  async getItem(key) {
    const plugin = getKeychain();
    if (plugin) {
      try {
        const { value } = await plugin.getSecret({ key });
        if (value != null) return value;
        const legacy = await Preferences.get({ key });
        if (legacy?.value != null) {
          await plugin.setSecret({ key, value: legacy.value }).catch(() => {});
          await Preferences.remove({ key }).catch(() => {});
          return legacy.value;
        }
        return null;
      } catch (error) {
        if (!isUnimplemented(error)) return null;
      }
    }
    const { value } = await Preferences.get({ key });
    return value ?? null;
  },
  async setItem(key, value) {
    const plugin = getKeychain();
    if (plugin) {
      try {
        await plugin.setSecret({ key, value });
        await Preferences.remove({ key }).catch(() => {});
        return;
      } catch (error) {
        if (!isUnimplemented(error)) throw error;
      }
    }
    await Preferences.set({ key, value });
  },
  async removeItem(key) {
    const plugin = getKeychain();
    if (plugin) {
      await plugin.removeSecret({ key }).catch(() => {});
    }
    await Preferences.remove({ key });
  },
};

/** The `auth.storage` option for `createClient`, or `undefined` on web/desktop. */
export const authStorage = () => (runtime() === MOBILE ? nativeAuthStorage : undefined);

/**
 * Checks whether a persisted auth session exists on the active shell's storage
 * (Keychain / Preferences on iOS, `localStorage` on web and desktop).
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

// Archive keys must only be remembered when the native Keychain is available.
export const archiveKeychain = {
  async get(uid) {
    const entry = await getKeychain()?.getSecret({ key: `ducat-archive-key:${uid}` });
    return entry?.value ?? null;
  },
  async set(uid, value) {
    const plugin = getKeychain();
    if (!plugin) return false;
    await plugin.setSecret({ key: `ducat-archive-key:${uid}`, value });
    return true;
  },
  async remove(uid) {
    await getKeychain()?.removeSecret({ key: `ducat-archive-key:${uid}` });
  },
};
