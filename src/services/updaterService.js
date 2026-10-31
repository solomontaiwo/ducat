/**
 * Bridge to the Tauri updater plugin.
 *
 * The updater is a desktop-only feature: every call is a no-op in the web app.
 * The plugin modules are imported dynamically (like `saveFile.js`) so the web
 * bundle never pulls Tauri internals into its graph.
 */

/** True only in the packaged desktop runtime (Vite `desktop` mode). */
export const isDesktopRuntime = () => import.meta.env.MODE === "desktop";

/**
 * Checks the configured `plugins.updater.endpoints` for a newer version.
 * Resolves to the raw `Update` object when an update is available, otherwise
 * `null` (up to date) — and `null` in the web runtime.
 */
export const checkForUpdates = async () => {
  if (!isDesktopRuntime()) return null;
  const { check } = await import("@tauri-apps/plugin-updater");
  return check();
};

/**
 * Downloads and installs an update, reporting progress via `onProgress`.
 * `onProgress` receives `{ downloaded, total }` in bytes; `total` is 0 when
 * the server did not report a content length.
 */
export const downloadAndInstall = async (update, onProgress) => {
  let downloaded = 0;
  let contentLength = 0;
  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        contentLength = event.data.contentLength ?? 0;
        onProgress?.({ downloaded: 0, total: contentLength });
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress?.({ downloaded, total: contentLength });
        break;
      case "Finished":
        onProgress?.({ downloaded, total: contentLength });
        break;
      default:
        break;
    }
  });
};

/** Relaunches the app after an update has been installed. */
export const relaunch = async () => {
  const { relaunch: relaunchApp } = await import("@tauri-apps/plugin-process");
  await relaunchApp();
};
