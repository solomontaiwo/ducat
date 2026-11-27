import { useMemo } from "react";
import { isWeb } from "../platform/index.js";
import { APP_VERSION } from "./appVersion.js";

const RELEASES_REPO = import.meta.env.VITE_RELEASES_REPO || "solomontaiwo/ducat";
export const RELEASES_URL = `https://github.com/${RELEASES_REPO}/releases/latest`;
export const DEFAULT_IOS_DOWNLOAD_URL = "https://testflight.apple.com/join/C3BV5sCa";

/**
 * Stable download links on our own domain. `public/_redirects` sends each one
 * to the fixed-name installer in the latest GitHub release, so the links never
 * change between versions and the page needs no GitHub API call.
 */
export const DOWNLOAD_URLS = Object.freeze({
  macos: "https://ducatapp.com/download/macos",
  windowsX64: "https://ducatapp.com/download/windows",
  windowsArm64: "https://ducatapp.com/download/windows-arm64",
});

export const sanitizeHttpsUrl = (raw) => {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
};

export const getConfiguredIosUrl = () => {
  const configured = import.meta.env.VITE_IOS_DOWNLOAD_URL;
  if (configured === "none" || configured === "false") return null;
  return sanitizeHttpsUrl(configured || DEFAULT_IOS_DOWNLOAD_URL);
};

/** Detects the visitor's OS so download links can highlight the matching app. */
export const detectClientPlatform = (nav = typeof navigator !== "undefined" ? navigator : null) => {
  if (!nav) return { platform: "other", arch: null };
  const ua = nav.userAgent || "";
  const uaPlatform = nav.userAgentData?.platform || nav.platform || "";
  const touchPoints = Number(nav.maxTouchPoints || 0);

  if (/iphone|ipad|ipod/i.test(ua) || (/mac/i.test(uaPlatform) && touchPoints > 1)) {
    return { platform: "ios", arch: "arm64" };
  }
  if (/android/i.test(ua)) {
    return { platform: "android", arch: null };
  }
  if (/macintosh|mac os x/i.test(ua) || /mac/i.test(uaPlatform)) {
    return { platform: "macos", arch: "arm64" };
  }
  if (/windows/i.test(ua) || /win/i.test(uaPlatform)) {
    const uaArch = nav.userAgentData?.architecture || "";
    const isArm = /arm/i.test(uaArch) || /arm64|aarch64/i.test(ua);
    return { platform: "windows", arch: isArm ? "arm64" : "x64" };
  }
  return { platform: "other", arch: null };
};

/**
 * Resolves native download links for web visitors. Returns `available: false`
 * inside the iOS and desktop apps so store builds never offer external installs.
 */
export const useAppDownloads = () => {
  const available = isWeb();
  const { platform, arch } = useMemo(() => detectClientPlatform(), []);
  const iosUrl = getConfiguredIosUrl();
  const macosUrl = DOWNLOAD_URLS.macos;
  const windowsUrl = platform === "windows" && arch === "arm64" ? DOWNLOAD_URLS.windowsArm64 : DOWNLOAD_URLS.windowsX64;

  const primary = useMemo(() => {
    if (!available) return null;
    if (platform === "macos") return { platform: "macos", href: macosUrl, direct: true };
    if (platform === "windows") return { platform: "windows", href: windowsUrl, direct: true };
    if (platform === "ios" && iosUrl) return { platform: "ios", href: iosUrl, direct: true };
    return null;
  }, [available, platform, macosUrl, windowsUrl, iosUrl]);

  return {
    available,
    platform,
    arch,
    // The site and the desktop release share package.json's version.
    version: APP_VERSION,
    iosUrl,
    macosUrl,
    windowsUrl,
    releasesUrl: RELEASES_URL,
    primary,
  };
};
