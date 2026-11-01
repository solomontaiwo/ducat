/**
 * Saving a generated file.
 *
 * The implementation lives in `src/platform/files.js`, which knows the
 * difference between the web, the Tauri desktop shell and Capacitor iOS. This
 * module keeps the historic import path used by the export helpers.
 */
export { saveFile, safeFilename } from "../platform/files.js";
