import { version } from "../../package.json";
import { version as iosVersion } from "../../ios/version.json";
import { isMobile } from "../platform/index.js";

/**
 * iOS has an independent App Store version; web and desktop use package.json.
 */
export const APP_VERSION = isMobile() ? iosVersion : version;
