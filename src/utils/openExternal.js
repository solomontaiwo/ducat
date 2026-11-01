import { isDesktopRuntime } from "../services/updaterService.js";

/** Opens a public link in the default browser (native on desktop). */
export const openExternal = async (url) => {
  if (isDesktopRuntime()) {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
      return;
    } catch {
      // Fall through to the web behaviour if the plugin is unavailable.
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
};
