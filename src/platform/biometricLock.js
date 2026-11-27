/**
 * Whether the in-app biometric lock is on. Kept apart from `biometrics.js`
 * (which loads the native plugin) so the privacy provider can read it at
 * startup without pulling Capacitor into the initial bundle.
 */

import { MOBILE, runtime } from "./index.js";
import { readLocalValue, removeLocalValue, writeLocalValue } from "../utils/storage.js";

export const BIOMETRIC_ENABLED_KEY = "ducat-biometric-lock";

/** Only the iOS app has the lock; elsewhere it is always off. */
export const isBiometricLockEnabled = () => runtime() === MOBILE && readLocalValue(BIOMETRIC_ENABLED_KEY) === "true";

export const setBiometricLockEnabled = (enabled) => {
  if (enabled) writeLocalValue(BIOMETRIC_ENABLED_KEY, "true");
  else removeLocalValue(BIOMETRIC_ENABLED_KEY);
};
