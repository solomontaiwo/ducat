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
const canCheckForUpdates = () => isDesktop() && !isStoreBuild();

/**
 * Remove the generated installer instructions from the in-app release history.
 * Older releases also carried a Linux line, matched so their notes stay clean.
 */
export const formatReleaseHistoryNotes = (body) => {
  if (typeof body !== "string") return "";
  return body.replace(/\r\n/g, "\n").replace(
    /(?:\r?\n)*---\r?\n\r?\nDesktop build for version `[^`]+` · commit `[^`]+`\.\r?\n\r?\nChoose the installer for your operating system and architecture\. The macOS and Windows installers are not signed or notarized\.(?:\r?\nOn Linux, the AppImage supports built-in updates; \.deb, \.rpm and pacman packages are updated with the package manager\.)?(?:\r?\n|$)/,
    "\n",
  ).trim();
};

/** Bundle types whose runtime can install an update itself: macOS `.app` and Windows NSIS. */
const SELF_UPDATE_BUNDLES = new Set(["app", "nsis"]);

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

/** What decides whether this installation can update itself: its bundle type. */
export const readUpdateRuntime = async () => {
  if (!canCheckForUpdates()) return null;
  return { bundleType: await readBundleType() };
};

export const canSelfUpdateBundle = (bundleType) => SELF_UPDATE_BUNDLES.has(bundleType);

export const canSelfUpdate = (runtime) => Boolean(runtime && canSelfUpdateBundle(runtime.bundleType));

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
