import { describe, expect, it, vi } from "vitest";
import {
  canSelfUpdate,
  canSelfUpdateBundle,
  formatReleaseHistoryNotes,
  readBundleType,
  readUpdateRuntime,
} from "../src/services/updaterService.js";
import { openExternal } from "../src/utils/openExternal.js";

const runtime = (bundleType, extra = {}) => ({
  bundleType,
  appImage: false,
  installDirWritable: true,
  ...extra,
});

describe("release history notes", () => {
  const footer = [
    "---",
    "",
    "Desktop build for version `4.0.30` · commit `2eb04b6f42d17107525c05d217a99d1d3fef170a`.",
    "",
    "Choose the installer for your operating system and architecture. The macOS and Windows installers are not signed or notarized.",
    "On Linux, the AppImage supports built-in updates; .deb, .rpm and pacman packages are updated with the package manager.",
  ].join("\n");

  it("hides the generated footer while keeping the changelog and additional notes", () => {
    const notes = `## Changelog\n\n- New: feature\n\n${footer}\n\nAdditional notes`;
    expect(formatReleaseHistoryNotes(notes)).toBe("## Changelog\n\n- New: feature\n\nAdditional notes");
    expect(formatReleaseHistoryNotes(notes.replaceAll("\n", "\r\n")))
      .toBe("## Changelog\n\n- New: feature\n\nAdditional notes");
  });

  it("preserves unrelated release notes and handles missing content", () => {
    const notes = "Changes\n\n---\n\nOther important information";
    expect(formatReleaseHistoryNotes(notes)).toBe(notes);
    expect(formatReleaseHistoryNotes(null)).toBe("");
    expect(formatReleaseHistoryNotes(footer)).toBe("");
  });
});

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
  ])("canSelfUpdateBundle(%s) = %s", (bundleType, expected) => {
    expect(canSelfUpdateBundle(bundleType)).toBe(expected);
  });

  it("allows an AppImage only when it was started as one and is writable", () => {
    expect(canSelfUpdate(runtime("appimage", { appImage: true, installDirWritable: true }))).toBe(true);
    expect(canSelfUpdate(runtime("appimage", { appImage: false, installDirWritable: true }))).toBe(false);
    expect(canSelfUpdate(runtime("appimage", { appImage: true, installDirWritable: false }))).toBe(false);
  });

  it("keeps macOS and Windows self-updates enabled", () => {
    expect(canSelfUpdate(runtime("app"))).toBe(true);
    expect(canSelfUpdate(runtime("nsis"))).toBe(true);
    expect(canSelfUpdate(runtime("deb"))).toBe(false);
    expect(canSelfUpdate(null)).toBe(false);
  });

  it("does not ask the runtime for details in the web app", async () => {
    await expect(readBundleType()).resolves.toBeNull();
    await expect(readUpdateRuntime()).resolves.toBeNull();
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
