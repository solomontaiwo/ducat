/**
 * Native biometric lock (Face ID / Touch ID) for the iOS shell.
 *
 * Calls the local Swift Capacitor plugin (`BiometricAuthPlugin.swift`) when
 * running on iOS; on the web and on the desktop every call resolves safely to
 * an unavailable / no-op state without touching any native plugin.
 */

import { registerPlugin } from "@capacitor/core";
import { MOBILE, runtime } from "./index.js";
import { readLocalValue, removeLocalValue, writeLocalValue } from "../utils/storage.js";

export const BIOMETRIC_ENABLED_KEY = "ducat-biometric-lock";

let cachedPlugin = null;

const getPlugin = () => {
  if (runtime() !== MOBILE) return null;
  if (!cachedPlugin) {
    cachedPlugin = registerPlugin("BiometricAuth");
  }
  return cachedPlugin;
};

/** @returns {Promise<{ available: boolean, biometryType: "faceID"|"touchID"|"opticID"|"passcode"|"none" }>} */
export const checkBiometricAvailability = async () => {
  const plugin = getPlugin();
  if (!plugin) return { available: false, biometryType: "none" };
  try {
    const result = await plugin.isAvailable();
    return {
      available: Boolean(result?.available),
      biometryType: result?.biometryType || "none",
    };
  } catch {
    return { available: false, biometryType: "none" };
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

export const isBiometricLockEnabled = () => {
  if (runtime() !== MOBILE) return false;
  return readLocalValue(BIOMETRIC_ENABLED_KEY) === "true";
};

export const setBiometricLockEnabled = (enabled) => {
  if (enabled) {
    writeLocalValue(BIOMETRIC_ENABLED_KEY, "true");
  } else {
    removeLocalValue(BIOMETRIC_ENABLED_KEY);
  }
};

/** Test helper: clears the cached Capacitor plugin proxy. */
export const resetBiometricsForTests = () => {
  cachedPlugin = null;
};
