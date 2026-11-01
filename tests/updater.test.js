import { describe, expect, it, vi } from "vitest";
import { canSelfUpdate, readBundleType } from "../src/services/updaterService.js";
import { openExternal } from "../src/utils/openExternal.js";

describe("updater bundle support", () => {
  it.each([
    ["appimage", true],
    ["app", true],
    ["nsis", true],
    ["deb", false],
    ["rpm", false],
    ["msi", false],
    ["unknown", false],
    [null, false],
  ])("canSelfUpdate(%s) = %s", (bundleType, expected) => {
    expect(canSelfUpdate(bundleType)).toBe(expected);
  });

  it("does not ask the runtime for a bundle type in the web app", async () => {
    await expect(readBundleType()).resolves.toBeNull();
  });
});

describe("openExternal", () => {
  it("opens a new browser tab in the web app", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    await openExternal("https://example.com/releases");
    expect(open).toHaveBeenCalledWith("https://example.com/releases", "_blank", "noopener,noreferrer");
    open.mockRestore();
  });
});
