/**
 * Tactile feedback. iOS-only: on the web and on the desktop the calls resolve
 * to `false` without loading any plugin, so components can call them freely.
 */

import { MOBILE, runtime } from "./index.js";

export const IMPACT_STYLES = {
  light: "Light",
  medium: "Medium",
  heavy: "Heavy",
};

/** A short tap, used for navigation and toggles. */
export const hapticTap = async (style = "light") => {
  if (runtime() !== MOBILE) return false;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle[IMPACT_STYLES[style] ?? "Light"] });
    return true;
  } catch {
    return false;
  }
};

/** Confirmation feedback, used after a successful save. */
export const hapticSuccess = async () => {
  if (runtime() !== MOBILE) return false;
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Success });
    return true;
  } catch {
    return false;
  }
};
