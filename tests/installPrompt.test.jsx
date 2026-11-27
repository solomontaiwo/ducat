import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

const load = async ({ mode, userAgent }) => {
  vi.resetModules();
  vi.stubEnv("MODE", mode);
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
  const { useInstallPrompt } = await import("../src/utils/installPrompt.js");
  return renderHook(() => useInstallPrompt()).result.current;
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("install the app", () => {
  it("explains the Safari steps on the iPhone website", async () => {
    const install = await load({ mode: "production", userAgent: IPHONE });
    expect(install.needsManualSteps).toBe(true);
    expect(install.canPrompt).toBe(false);
  });

  it("is never offered inside the iOS app", async () => {
    const install = await load({ mode: "mobile", userAgent: IPHONE });
    expect(install.needsManualSteps).toBe(false);
    expect(install.canPrompt).toBe(false);
  });

  it("is never offered inside the desktop app, even with a browser prompt", async () => {
    vi.resetModules();
    vi.stubEnv("MODE", "desktop");
    const { useInstallPrompt } = await import("../src/utils/installPrompt.js");
    const event = new Event("beforeinstallprompt");
    window.dispatchEvent(event);
    const install = renderHook(() => useInstallPrompt()).result.current;
    expect(install.canPrompt).toBe(false);
    expect(install.needsManualSteps).toBe(false);
  });
});
