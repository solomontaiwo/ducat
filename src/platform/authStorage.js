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
import { DESKTOP, MOBILE, runtime } from "./index.js";
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

const isNativeMac = () => runtime() === DESKTOP && globalThis.navigator?.platform?.startsWith("Mac");

const invokeArchive = async (command, args) => {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke(command, args);
};

const removeLegacyArchiveKey = (plugin, uid) => plugin.removeSecret({ key: `ducat-archive-key:${uid}` });

export const archiveKeychain = {
  async status(uid) {
    const plugin = getKeychain();
    if (plugin) {
      // Previous versions remembered a key without user presence. Remove it
      // without reading it so only the protected entry can unlock an archive.
      await removeLegacyArchiveKey(plugin, uid);
      return plugin.archiveKeyStatus({ uid });
    }
    if (isNativeMac()) return invokeArchive("archive_key_status", { uid });
    return { available: false, configured: false };
  },
  async get(uid, reason) {
    const plugin = getKeychain();
    const entry = plugin ? await plugin.unlockArchiveKey({ uid, reason })
      : isNativeMac() ? await invokeArchive("unlock_archive_key", { uid }) : null;
    return entry?.value ?? null;
  },
  async set(uid, value) {
    const plugin = getKeychain();
    if (plugin) await plugin.saveArchiveKey({ uid, value });
    else if (isNativeMac()) await invokeArchive("save_archive_key", { uid, value });
    else return false;
    return true;
  },
  async remove(uid) {
    const plugin = getKeychain();
    if (plugin) await Promise.all([removeLegacyArchiveKey(plugin, uid), plugin.removeArchiveKey({ uid })]);
    else if (isNativeMac()) await invokeArchive("remove_archive_key", { uid });
  },
};
