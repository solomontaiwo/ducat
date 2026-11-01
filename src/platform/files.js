/**
 * Saving a generated file (PDF, CSV, JSON backup).
 *
 * Every shell has a different idea of what "save" means:
 * - mobile (iOS): there is no user-visible file picker, so the file is written
 *   to the app cache and handed to the system share sheet;
 * - desktop: the Tauri save dialog, which is the only place allowed to write
 *   outside the app container;
 * - web: a download through an object URL.
 */

import { DESKTOP, MOBILE, runtime } from "./index.js";

/** Characters that would break a path or a share target. */
export const safeFilename = (filename) =>
  String(filename ?? "export")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 180) || "export";

export const blobToBase64 = async (blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
};

const downloadInBrowser = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
};

const saveOnDesktop = async (blob, filename) => {
  const [{ save }, { writeFile }] = await Promise.all([
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/plugin-fs"),
  ]);
  const extension = filename.split(".").pop();
  const path = await save({
    defaultPath: filename,
    filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
  });
  if (!path) return false;
  await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
  return true;
};

/**
 * Writes to the app cache and opens the iOS share sheet, so the user can send
 * the report to Files, Mail, Drive or any other app installed on the device.
 */
export const shareOnMobile = async (blob, filename, { title } = {}) => {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  const name = safeFilename(filename);
  const { uri } = await Filesystem.writeFile({
    path: name,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
    recursive: true,
  });
  await Share.share({ title: title ?? name, url: uri, dialogTitle: title ?? name });
  return true;
};

/** Resolves to `false` only when the desktop user cancels the save dialog. */
export const saveFile = async (blob, filename, options = {}) => {
  const filenameSafe = safeFilename(filename);
  const current = runtime();
  if (current === MOBILE) return shareOnMobile(blob, filenameSafe, options);
  if (current === DESKTOP) return saveOnDesktop(blob, filenameSafe);
  return downloadInBrowser(blob, filenameSafe);
};
