import { useEffect, useMemo, useState } from "react";
import { isWeb } from "../platform/index.js";

const RELEASES_REPO = import.meta.env.VITE_RELEASES_REPO || "solomontaiwo/ducat";
export const RELEASES_URL = `https://github.com/${RELEASES_REPO}/releases/latest`;
export const DEFAULT_IOS_DOWNLOAD_URL = "https://testflight.apple.com/join/C3BV5sCa";
const RELEASES_API = `https://api.github.com/repos/${RELEASES_REPO}/releases/latest`;

let cachedReleasePromise = null;
let cachedRelease = null;

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

/** Picks direct installer URLs from a GitHub Release payload. */
export const pickReleaseDownloads = (release) => {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const findAsset = (pattern) => {
    const match = assets.find((asset) => pattern.test(asset?.name || ""));
    return sanitizeHttpsUrl(match?.browser_download_url);
  };
  const macosDmg = findAsset(/macos-arm64\.dmg$/i) || findAsset(/\.dmg$/i);
  const windowsX64 = findAsset(/windows-x64-setup\.exe$/i) || findAsset(/x86_64-setup\.exe$/i);
  const windowsArm64 = findAsset(/windows-arm64-setup\.exe$/i) || findAsset(/aarch64-setup\.exe$/i);
  const version = typeof release?.tag_name === "string" ? release.tag_name.replace(/^v/i, "") : null;
  return { macosDmg, windowsX64, windowsArm64, version };
};

export const fetchLatestReleaseDownloads = async () => {
  if (cachedRelease) return cachedRelease;
  if (cachedReleasePromise) return cachedReleasePromise;
  if (typeof fetch !== "function") return {};

  cachedReleasePromise = fetch(RELEASES_API, {
    headers: { Accept: "application/vnd.github+json" },
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (!data) return {};
      cachedRelease = pickReleaseDownloads(data);
      return cachedRelease;
    })
    .catch(() => ({}))
    .finally(() => {
      cachedReleasePromise = null;
    });

  return cachedReleasePromise;
};

export const resetReleaseDownloadsCache = () => {
  cachedRelease = null;
  cachedReleasePromise = null;
};

/**
 * Resolves native download links for web visitors. Returns `available: false`
 * inside the iOS and desktop apps so store builds never offer external installs.
 */
export const useAppDownloads = ({ enabled = true } = {}) => {
  const available = isWeb();
  const { platform, arch } = useMemo(() => detectClientPlatform(), []);
  const iosUrl = getConfiguredIosUrl();
  const [release, setRelease] = useState(() => cachedRelease || {});

  useEffect(() => {
    if (!available || !enabled || cachedRelease) return undefined;
    let cancelled = false;
    fetchLatestReleaseDownloads().then((resolved) => {
      if (!cancelled && resolved && Object.keys(resolved).length) setRelease(resolved);
    });
    return () => { cancelled = true; };
  }, [available, enabled]);

  const macosUrl = release.macosDmg || RELEASES_URL;
  const preferWindowsArm = platform === "windows" && arch === "arm64";
  const windowsUrl = (preferWindowsArm ? release.windowsArm64 || release.windowsX64 : release.windowsX64 || release.windowsArm64) || RELEASES_URL;

  const primary = useMemo(() => {
    if (!available) return null;
    if (platform === "macos") return { platform: "macos", href: macosUrl, direct: Boolean(release.macosDmg) };
    if (platform === "windows") return { platform: "windows", href: windowsUrl, direct: Boolean(release.windowsX64 || release.windowsArm64) };
    if (platform === "ios" && iosUrl) return { platform: "ios", href: iosUrl, direct: true };
    return null;
  }, [available, platform, macosUrl, windowsUrl, iosUrl, release.macosDmg, release.windowsX64, release.windowsArm64]);

  return {
    available,
    platform,
    arch,
    version: release.version || null,
    iosUrl,
    macosUrl,
    windowsUrl,
    releasesUrl: RELEASES_URL,
    primary,
  };
};
