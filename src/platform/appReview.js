/**
 * Native App Store review prompt (`SKStoreReviewController`) for iOS.
 *
 * Counts real saved transactions on-device and asks iOS to present the native
 * rating sheet at most once per app version, only after the user has seen real
 * value (`MIN_SAVES_BEFORE_PROMPT`). Apple's OS-level throttling still applies.
 */

import { registerPlugin } from "@capacitor/core";
import { MOBILE, runtime } from "./index.js";
import { APP_VERSION } from "../utils/appVersion.js";
import { readLocalValue, removeLocalValue, writeLocalValue } from "../utils/storage.js";

export const REVIEW_SAVES_KEY = "ducat-review-saves";
export const REVIEW_VERSION_KEY = "ducat-review-prompted-version";
export const MIN_SAVES_BEFORE_PROMPT = 10;

let cachedPlugin = null;

const getPlugin = () => {
  if (runtime() !== MOBILE) return null;
  if (!cachedPlugin) cachedPlugin = registerPlugin("NativeFeatures");
  return cachedPlugin;
};

/**
 * Records a completed transaction save and requests an in-app review once the
 * threshold is reached for the current version. Safe no-op outside iOS.
 */
export const recordPositiveSaveAndMaybeRequestReview = async ({ isDemo = false } = {}) => {
  if (isDemo || runtime() !== MOBILE) return false;

  const previous = Number.parseInt(readLocalValue(REVIEW_SAVES_KEY, "0"), 10);
  const count = (Number.isFinite(previous) && previous > 0 ? previous : 0) + 1;
  writeLocalValue(REVIEW_SAVES_KEY, String(count));

  if (count < MIN_SAVES_BEFORE_PROMPT) return false;
  if (readLocalValue(REVIEW_VERSION_KEY) === APP_VERSION) return false;

  const plugin = getPlugin();
  if (!plugin) return false;
  try {
    const result = await plugin.requestAppReview();
    if (result?.requested) {
      writeLocalValue(REVIEW_VERSION_KEY, APP_VERSION);
      return true;
    }
    return false;
  } catch {
    return false;
  }
};

export const resetReviewState = () => {
  removeLocalValue(REVIEW_SAVES_KEY);
  removeLocalValue(REVIEW_VERSION_KEY);
  cachedPlugin = null;
};
