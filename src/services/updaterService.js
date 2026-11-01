/**
 * Bridge to the Tauri updater plugin.
 *
 * The updater is a desktop-only feature: every call is a no-op in the web app.
 * The plugin modules are imported dynamically (like `saveFile.js`) so the web
 * bundle never pulls Tauri internals into its graph.
 */

import { isDesktop, isStoreBuild } from "../platform/index.js";

/** True only in the packaged desktop runtime (Vite `desktop` mode). */
export const isDesktopRuntime = () => isDesktop();

/**
 * Self-updates are never offered in a Mac App Store build: the store owns
 * updates (guideline 2.4.5) and the sandbox forbids replacing the bundle.
 */
export const canCheckForUpdates = () => isDesktop() && !isStoreBuild();

/**
 * Bundle types whose runtime can install an update itself. On Linux this is
 * AppImage only: deb, rpm and pacman packages are owned by the system package
 * manager, so the updater must not try to replace their binaries.
 */
const SELF_UPDATE_BUNDLES = new Set(["appimage", "app", "nsis"]);

/** The bundle type reported by the running desktop app (null in the web app). */
export const readBundleType = async () => {
  if (!canCheckForUpdates()) return null;
  try {
    const { getBundleType } = await import("@tauri-apps/api/app");
    return await getBundleType();
  } catch {
    // Older runtimes without the command are treated as not self-updatable.
    return null;
  }
};

/**
 * Everything needed to decide whether this installation can update itself:
 * bundle type, whether it was launched from an AppImage, and whether the
 * directory holding it is writable (the Linux updater renames the new file
 * into place, so the temp file must live on the same writable mount).
 */
export const readUpdateRuntime = async () => {
  if (!canCheckForUpdates()) return null;
  try {
    const [{ invoke }, bundleType] = await Promise.all([
      import("@tauri-apps/api/core"),
      readBundleType(),
    ]);
    const info = await invoke("updater_runtime_info");
    return {
      bundleType,
      appImage: Boolean(info.appImage),
      installPath: info.installPath ?? null,
      installDirWritable: Boolean(info.installDirWritable),
    };
  } catch {
    return null;
  }
};

export const canSelfUpdateBundle = (bundleType) => SELF_UPDATE_BUNDLES.has(bundleType);

/**
 * Self-updates are enabled for macOS `.app`, Windows NSIS and Linux AppImage.
 * The AppImage must have been started as such (APPIMAGE set) and live in a
 * writable directory, otherwise the updater cannot replace it.
 */
export const canSelfUpdate = (runtime) => {
  if (!runtime || !canSelfUpdateBundle(runtime.bundleType)) return false;
  if (runtime.bundleType !== "appimage") return true;
  return Boolean(runtime.appImage && runtime.installDirWritable);
};

/**
 * Checks the configured `plugins.updater.endpoints` for a newer version.
 * Resolves to the raw `Update` object when an update is available, otherwise
 * `null` (up to date) — and `null` in the web runtime.
 */
export const checkForUpdates = async () => {
  if (!canCheckForUpdates()) return null;
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
