import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_IOS_DOWNLOAD_URL,
  RELEASES_URL,
  detectClientPlatform,
  fetchLatestReleaseDownloads,
  pickReleaseDownloads,
  resetReleaseDownloadsCache,
  sanitizeHttpsUrl,
} from "../src/utils/appDownloads.js";

const SAMPLE_RELEASE = {
  tag_name: "v4.0.65",
  assets: [
    { name: "Ducat-4.0.65-macos-arm64.dmg", browser_download_url: "https://github.com/solomontaiwo/ducat/releases/download/v4.0.65/Ducat-4.0.65-macos-arm64.dmg" },
    { name: "Ducat-4.0.65-windows-x64-setup.exe", browser_download_url: "https://github.com/solomontaiwo/ducat/releases/download/v4.0.65/Ducat-4.0.65-windows-x64-setup.exe" },
    { name: "Ducat-4.0.65-windows-arm64-setup.exe", browser_download_url: "https://github.com/solomontaiwo/ducat/releases/download/v4.0.65/Ducat-4.0.65-windows-arm64-setup.exe" },
  ],
};

afterEach(() => {
  resetReleaseDownloadsCache();
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

  it("extracts direct installer URLs and version from a GitHub release", () => {
    expect(pickReleaseDownloads(SAMPLE_RELEASE)).toEqual({
      macosDmg: "https://github.com/solomontaiwo/ducat/releases/download/v4.0.65/Ducat-4.0.65-macos-arm64.dmg",
      windowsX64: "https://github.com/solomontaiwo/ducat/releases/download/v4.0.65/Ducat-4.0.65-windows-x64-setup.exe",
      windowsArm64: "https://github.com/solomontaiwo/ducat/releases/download/v4.0.65/Ducat-4.0.65-windows-arm64-setup.exe",
      version: "4.0.65",
    });
  });

  it("falls back cleanly when GitHub Releases fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await fetchLatestReleaseDownloads()).toEqual({});
  });

  it("resolves the direct macOS .dmg link on web and hides downloads in native apps", async () => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.stubEnv("MODE", "production");
    vi.stubEnv("VITE_IOS_DOWNLOAD_URL", "");
    vi.stubEnv("VITE_IOS_DOWNLOAD_URL", "https://testflight.apple.com/join/Test1234");
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => SAMPLE_RELEASE }));

    const { useAppDownloads } = await import("../src/utils/appDownloads.js");
    const { result } = renderHook(() => useAppDownloads());
    expect(result.current.available).toBe(true);
    expect(result.current.iosUrl).toBe("https://testflight.apple.com/join/Test1234");
    expect(result.current.macosUrl).toBe(RELEASES_URL);
    await waitFor(() => expect(result.current.macosUrl).toBe(SAMPLE_RELEASE.assets[0].browser_download_url));
    expect(result.current.primary).toEqual({
      platform: "macos",
      href: SAMPLE_RELEASE.assets[0].browser_download_url,
      direct: true,
    });

    vi.unstubAllEnvs();
    vi.resetModules();
    vi.stubEnv("MODE", "production");
    vi.stubEnv("VITE_IOS_DOWNLOAD_URL", "");
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X)");
    vi.spyOn(navigator, "platform", "get").mockReturnValue("iPhone");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const iosWebMod = await import("../src/utils/appDownloads.js");
    const iosWebHook = renderHook(() => iosWebMod.useAppDownloads()).result.current;
    expect(iosWebHook.iosUrl).toBe(DEFAULT_IOS_DOWNLOAD_URL);
    expect(iosWebHook.primary).toEqual({
      platform: "ios",
      href: DEFAULT_IOS_DOWNLOAD_URL,
      direct: true,
    });

    vi.resetModules();
    vi.stubEnv("MODE", "mobile");
    const mobileMod = await import("../src/utils/appDownloads.js");
    const mobileHook = renderHook(() => mobileMod.useAppDownloads()).result.current;
    expect(mobileHook.available).toBe(false);
    expect(mobileHook.primary).toBeNull();
  });
});
