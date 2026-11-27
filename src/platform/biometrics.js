/**
 * Native biometric lock (Face ID / Touch ID) for the iOS shell.
 *
 * Calls the local Swift Capacitor plugin (`BiometricAuthPlugin.swift`) when
 * running on iOS; on the web and on the desktop every call resolves safely to
 * an unavailable / no-op state without touching any native plugin.
 */

import { registerPlugin } from "@capacitor/core";
import { MOBILE, runtime } from "./index.js";

export { isBiometricLockEnabled, setBiometricLockEnabled } from "./biometricLock.js";

let cachedPlugin = null;

const getPlugin = () => {
  if (runtime() !== MOBILE) return null;
  if (!cachedPlugin) {
    cachedPlugin = registerPlugin("BiometricAuth");
  }
  return cachedPlugin;
};

const UNAVAILABLE = Object.freeze({ available: false, biometryType: "none", systemAppLock: false });

/**
 * `systemAppLock`: iOS itself can lock the app (iOS 18+, "Require Face ID"
 * from the Home Screen menu), so the in-app lock is not offered.
 * @returns {Promise<{ available: boolean, biometryType: "faceID"|"touchID"|"opticID"|"passcode"|"none", systemAppLock: boolean }>}
 */
export const checkBiometricAvailability = async () => {
  const plugin = getPlugin();
  if (!plugin) return { ...UNAVAILABLE };
  try {
    const result = await plugin.isAvailable();
    return {
      available: Boolean(result?.available),
      biometryType: result?.biometryType || "none",
      systemAppLock: Boolean(result?.systemAppLock),
    };
  } catch {
    return { ...UNAVAILABLE };
  }
};

/** @returns {Promise<{ authenticated: boolean, errorCode?: string }>} */
export const authenticateBiometric = async (reason) => {
  const plugin = getPlugin();
  if (!plugin) return { authenticated: false, errorCode: "notAvailable" };
  try {
    const result = await plugin.authenticate({ reason: String(reason || "") });
    return { authenticated: Boolean(result?.authenticated) };
  } catch (error) {
    return { authenticated: false, errorCode: error?.code || "failed" };
  }
};

/** Test helper: clears the cached Capacitor plugin proxy. */
export const resetBiometricsForTests = () => {
  cachedPlugin = null;
};
