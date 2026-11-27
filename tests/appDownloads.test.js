/* global process */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_IOS_DOWNLOAD_URL,
  DOWNLOAD_URLS,
  detectClientPlatform,
  sanitizeHttpsUrl,
} from "../src/utils/appDownloads.js";
import { version } from "../package.json";

const readRepoFile = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

/** Parses `public/_redirects` into { source: { destination, status } }. */
const parseRedirects = (text) => Object.fromEntries(
  text.split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [source, destination, status] = line.split(/\s+/);
      return [source, { destination, status }];
    })
);

const loadHook = async ({ userAgent, platform, mode = "production" }) => {
  vi.resetModules();
  vi.stubEnv("MODE", mode);
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
  vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
  const { useAppDownloads } = await import("../src/utils/appDownloads.js");
  return renderHook(() => useAppDownloads()).result.current;
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("appDownloads", () => {
  it("detects macOS, Windows (x64 & arm64), iOS, iPadOS desktop UA, Android, and Linux", () => {
    expect(detectClientPlatform({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel", maxTouchPoints: 0 }))
      .toEqual({ platform: "macos", arch: "arm64" });
    expect(detectClientPlatform({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel", maxTouchPoints: 5 }))
      .toEqual({ platform: "ios", arch: "arm64" });
    expect(detectClientPlatform({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X)", platform: "iPhone", maxTouchPoints: 5 }))
      .toEqual({ platform: "ios", arch: "arm64" });
    expect(detectClientPlatform({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32" }))
      .toEqual({ platform: "windows", arch: "x64" });
    expect(detectClientPlatform({ userAgent: "Mozilla/5.0 (Windows NT 10.0; ARM64)", platform: "Win32", userAgentData: { platform: "Windows", architecture: "arm" } }))
      .toEqual({ platform: "windows", arch: "arm64" });
    expect(detectClientPlatform({ userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9)", platform: "Linux armv8l" }))
      .toEqual({ platform: "android", arch: null });
    expect(detectClientPlatform({ userAgent: "Mozilla/5.0 (X11; Linux x86_64)", platform: "Linux x86_64" }))
      .toEqual({ platform: "other", arch: null });
  });

  it("only accepts HTTPS URLs", () => {
    expect(sanitizeHttpsUrl("https://testflight.apple.com/join/AbCdEf12")).toBe("https://testflight.apple.com/join/AbCdEf12");
    expect(sanitizeHttpsUrl("http://example.com")).toBeNull();
    expect(sanitizeHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeHttpsUrl("")).toBeNull();
  });

  it("links every installer to a ducatapp.com redirect, without calling GitHub", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubEnv("VITE_IOS_DOWNLOAD_URL", "https://testflight.apple.com/join/Test1234");
    const mac = await loadHook({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel" });
    expect(mac.available).toBe(true);
    expect(mac.version).toBe(version);
    expect(mac.iosUrl).toBe("https://testflight.apple.com/join/Test1234");
    expect(mac.macosUrl).toBe("https://ducatapp.com/download/macos");
    expect(mac.windowsUrl).toBe("https://ducatapp.com/download/windows");
    expect(mac.primary).toEqual({ platform: "macos", href: "https://ducatapp.com/download/macos", direct: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("offers the ARM64 installer to Windows on ARM", async () => {
    const windows = await loadHook({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32" });
    expect(windows.primary).toEqual({ platform: "windows", href: DOWNLOAD_URLS.windowsX64, direct: true });

    const windowsArm = await loadHook({ userAgent: "Mozilla/5.0 (Windows NT 10.0; ARM64)", platform: "Win32" });
    expect(windowsArm.windowsUrl).toBe(DOWNLOAD_URLS.windowsArm64);
    expect(windowsArm.primary).toEqual({ platform: "windows", href: DOWNLOAD_URLS.windowsArm64, direct: true });
  });

  it("points iPhone visitors at TestFlight and hides downloads in native apps", async () => {
    vi.stubEnv("VITE_IOS_DOWNLOAD_URL", "");
    const iosWeb = await loadHook({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X)", platform: "iPhone" });
    expect(iosWeb.iosUrl).toBe(DEFAULT_IOS_DOWNLOAD_URL);
    expect(iosWeb.primary).toEqual({ platform: "ios", href: DEFAULT_IOS_DOWNLOAD_URL, direct: true });

    const mobile = await loadHook({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X)", platform: "iPhone", mode: "mobile" });
    expect(mobile.available).toBe(false);
    expect(mobile.primary).toBeNull();
  });

  it("keeps the download links, _redirects and the release asset names in sync", () => {
    const redirects = parseRedirects(readRepoFile("public/_redirects"));
    const workflow = readRepoFile(".github/workflows/desktop.yml");
    // Installer names the release job publishes: `copy_one <artifact> '<glob>' <name>`.
    const published = [...workflow.matchAll(/^\s*copy_one \S+ '[^']+' (\S+)$/gm)].map(([, name]) => `Ducat-${name}`);
    expect(published).toHaveLength(Object.keys(DOWNLOAD_URLS).length);

    const latest = "https://github.com/solomontaiwo/ducat/releases/latest/download/";
    const targets = Object.values(DOWNLOAD_URLS).map((url) => {
      const { origin, pathname } = new URL(url);
      expect(origin).toBe("https://ducatapp.com");
      const rule = redirects[pathname];
      expect(rule, `missing redirect for ${pathname}`).toBeDefined();
      expect(rule.status).toBe("302");
      expect(rule.destination.startsWith(latest)).toBe(true);
      return rule.destination.slice(latest.length);
    });
    expect(targets.sort()).toEqual(published.sort());

    // The updater's first endpoint resolves through the same file.
    expect(redirects["/download/latest.json"]).toEqual({ destination: `${latest}latest.json`, status: "302" });
    expect(workflow).toContain('"endpoints":["https://ducatapp.com/download/latest.json","https://github.com/');
  });
});
