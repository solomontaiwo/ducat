/**
 * Opening a public link in the default browser.
 *
 * Implemented per shell in `src/platform/links.js` (system browser on iOS,
 * Tauri opener on desktop, new tab on the web).
 */
export { openExternal, isAllowedExternalUrl } from "../platform/links.js";
