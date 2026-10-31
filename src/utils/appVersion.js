import { version } from "../../package.json";

/**
 * Current app version, read from package.json — the same value Tauri uses for
 * the bundled app (tauri.conf.json points at "../package.json").
 */
export const APP_VERSION = version;
