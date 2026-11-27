import { describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import {
  canSelfUpdate,
  canSelfUpdateBundle,
  formatReleaseHistoryNotes,
  readBundleType,
  readUpdateRuntime,
} from "../src/services/updaterService.js";
import { openExternal } from "../src/utils/openExternal.js";

describe("desktop release manifest", () => {
  it("publishes signed updates for macOS Apple Silicon and both Windows architectures", () => {
    const root = resolve(".");
    const workflow = readFileSync(join(root, ".github/workflows/desktop.yml"), "utf8");
    const selected = workflow.match(/--platforms ([^\s\\]+)/)?.[1];
    expect(selected?.split(",")).toEqual(["darwin-aarch64", "windows-x86_64", "windows-aarch64"]);
    const tmp = mkdtempSync(join(tmpdir(), "ducat-desktop-release-"));
    try {
      const downloaded = join(tmp, "downloaded");
      const out = join(tmp, "release");
      for (const [artifact, filename] of [
        ["macos-arm64", "Ducat.app.tar.gz"],
        ["windows-x64", "Ducat-setup.exe"],
        ["windows-arm64", "Ducat-setup.exe"],
      ]) {
        const dir = join(downloaded, `ducat-${artifact}-fixture`);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, filename), "fixture");
        writeFileSync(join(dir, `${filename}.sig`), `signature-${artifact}`);
      }
      const args = [join(root, "scripts/build-update-manifest.mjs"), "--downloaded", downloaded,
        "--repo", "example/ducat", "--tag", "v1.0.0", "--version", "1.0.0",
        "--platforms", selected, "--out", out];
      execFileSync(process.execPath, args);
      const manifest = JSON.parse(readFileSync(join(out, "latest.json"), "utf8"));
      expect(Object.keys(manifest.platforms)).toEqual(selected.split(","));
      expect(manifest.platforms["darwin-aarch64"].signature).toBe("signature-macos-arm64");
      expect(manifest.platforms["windows-x86_64"].signature).toBe("signature-windows-x64");
      expect(manifest.platforms["windows-aarch64"].signature).toBe("signature-windows-arm64");
      for (const item of Object.values(manifest.platforms)) {
        expect(item.url).toMatch(/^https:\/\/github\.com\/example\/ducat\/releases\/download\/v1\.0\.0\//);
      }
      rmSync(join(downloaded, "ducat-windows-arm64-fixture", "Ducat-setup.exe.sig"));
      expect(() => execFileSync(process.execPath, args, { stdio: "ignore" })).toThrow();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

const runtime = (bundleType) => ({ bundleType });

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

  it("hides the footer of releases without Linux packages", () => {
    const currentFooter = footer.split("\n").slice(0, -1).join("\n");
    expect(formatReleaseHistoryNotes(`## Changelog\n\n- Fix: example\n\n${currentFooter}`))
      .toBe("## Changelog\n\n- Fix: example");
  });
});

describe("updater bundle support", () => {
  it.each([
    ["appimage", false],
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
