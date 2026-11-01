import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DESKTOP, MOBILE, WEB, isDesktop, isMobile, isStoreBuild, isWeb, runtime } from "../src/platform/index.js";
import { blobToBase64, safeFilename, saveFile } from "../src/platform/files.js";
import { isAllowedExternalUrl, openExternal } from "../src/platform/links.js";
import { hapticTap } from "../src/platform/haptics.js";
import { authStorage, nativeAuthStorage } from "../src/platform/authStorage.js";

const shareMock = vi.fn(async () => ({}));
const writeFileMock = vi.fn(async () => ({ uri: "file:///cache/report.pdf" }));
const saveDialogMock = vi.fn(async () => "/tmp/report.pdf");
const writeTauriFileMock = vi.fn(async () => undefined);
const browserOpenMock = vi.fn(async () => undefined);
const impactMock = vi.fn(async () => undefined);
const preferencesMock = {
  get: vi.fn(async () => ({ value: "stored" })),
  set: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
};

vi.mock("@capacitor/share", () => ({ Share: { share: shareMock } }));
vi.mock("@capacitor/filesystem", () => ({
  Filesystem: { writeFile: writeFileMock },
  Directory: { Cache: "CACHE" },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: saveDialogMock }));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeFile: writeTauriFileMock }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(async () => undefined) }));
vi.mock("@capacitor/browser", () => ({ Browser: { open: browserOpenMock } }));
vi.mock("@capacitor/haptics", () => ({
  Haptics: { impact: impactMock, notification: vi.fn(async () => undefined) },
  ImpactStyle: { Light: "LIGHT", Medium: "MEDIUM", Heavy: "HEAVY" },
  NotificationType: { Success: "SUCCESS" },
}));
vi.mock("@capacitor/preferences", () => ({ Preferences: preferencesMock }));

const pdf = () => new Blob([new Uint8Array([37, 80, 68, 70])], { type: "application/pdf" });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("runtime detection", () => {
  it.each([
    ["test", WEB],
    ["desktop", DESKTOP],
    ["mobile", MOBILE],
    ["production", WEB],
  ])("maps MODE=%s to %s", (mode, expected) => {
    vi.stubEnv("MODE", mode);
    expect(runtime()).toBe(expected);
  });

  it("exposes one predicate per shell", () => {
    vi.stubEnv("MODE", "mobile");
    expect(isMobile()).toBe(true);
    expect(isDesktop()).toBe(false);
    expect(isWeb()).toBe(false);

    vi.stubEnv("MODE", "desktop");
    expect(isDesktop()).toBe(true);
    expect(isMobile()).toBe(false);
  });

  it("detects Mac App Store builds", () => {
    vi.stubEnv("VITE_APP_STORE", "1");
    expect(isStoreBuild()).toBe(true);
    vi.stubEnv("VITE_APP_STORE", "");
    expect(isStoreBuild()).toBe(false);
  });
});

describe("filenames", () => {
  it("strips path separators and reserved characters", () => {
    expect(safeFilename("report/2026:01?.pdf")).toBe("report-2026-01-.pdf");
    expect(safeFilename("...hidden.pdf")).toBe("hidden.pdf");
    expect(safeFilename("")).toBe("export");
    expect(safeFilename(undefined)).toBe("export");
  });
});

describe("saving files", () => {
  beforeEach(() => {
    globalThis.URL.createObjectURL = vi.fn(() => "blob:report");
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  it("downloads in the browser", async () => {
    vi.stubEnv("MODE", "production");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await expect(saveFile(pdf(), "report.pdf")).resolves.toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
    expect(writeFileMock).not.toHaveBeenCalled();
    click.mockRestore();
  });

  it("writes to the cache and opens the iOS share sheet", async () => {
    vi.stubEnv("MODE", "mobile");
    await expect(saveFile(pdf(), "report.pdf", { title: "Report" })).resolves.toBe(true);
    expect(writeFileMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: "report.pdf", directory: "CACHE" })
    );
    expect(shareMock).toHaveBeenCalledWith({
      title: "Report",
      url: "file:///cache/report.pdf",
      dialogTitle: "Report",
    });
  });

  it("returns false when the desktop save dialog is dismissed", async () => {
    vi.stubEnv("MODE", "desktop");
    saveDialogMock.mockResolvedValueOnce(null);
    await expect(saveFile(pdf(), "report.pdf")).resolves.toBe(false);
    expect(writeTauriFileMock).not.toHaveBeenCalled();
  });

  it("writes through the Tauri fs plugin on desktop", async () => {
    vi.stubEnv("MODE", "desktop");
    await expect(saveFile(pdf(), "report.pdf")).resolves.toBe(true);
    expect(writeTauriFileMock).toHaveBeenCalledWith("/tmp/report.pdf", expect.any(Uint8Array));
  });

  it("encodes bytes as base64", async () => {
    await expect(blobToBase64(pdf())).resolves.toBe("JVBERg==");
  });
});

describe("external links", () => {
  it("only accepts web and mail protocols", () => {
    expect(isAllowedExternalUrl("https://example.com")).toBe(true);
    expect(isAllowedExternalUrl("mailto:hi@example.com")).toBe(true);
    expect(isAllowedExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedExternalUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedExternalUrl("not a url")).toBe(false);
  });

  it("rejects unsafe links before touching a plugin", async () => {
    vi.stubEnv("MODE", "mobile");
    await expect(openExternal("javascript:alert(1)")).rejects.toThrow("Unsupported external link");
    expect(browserOpenMock).not.toHaveBeenCalled();
  });

  it("uses the in-app browser on iOS", async () => {
    vi.stubEnv("MODE", "mobile");
    await openExternal("https://example.com/releases");
    expect(browserOpenMock).toHaveBeenCalledWith({ url: "https://example.com/releases" });
  });
});

describe("haptics", () => {
  it("does nothing outside the mobile shell", async () => {
    vi.stubEnv("MODE", "desktop");
    await expect(hapticTap()).resolves.toBe(false);
    expect(impactMock).not.toHaveBeenCalled();
  });

  it("taps on iOS", async () => {
    vi.stubEnv("MODE", "mobile");
    await expect(hapticTap("medium")).resolves.toBe(true);
    expect(impactMock).toHaveBeenCalledWith({ style: "MEDIUM" });
  });
});

describe("auth storage", () => {
  it("keeps the default storage on the web", () => {
    vi.stubEnv("MODE", "production");
    expect(authStorage()).toBeUndefined();
  });

  it("uses native preferences on iOS", async () => {
    vi.stubEnv("MODE", "mobile");
    expect(authStorage()).toBe(nativeAuthStorage);
    await expect(nativeAuthStorage.getItem("sb-key")).resolves.toBe("stored");
    await nativeAuthStorage.setItem("sb-key", "value");
    expect(preferencesMock.set).toHaveBeenCalledWith({ key: "sb-key", value: "value" });
    await nativeAuthStorage.removeItem("sb-key");
    expect(preferencesMock.remove).toHaveBeenCalledWith({ key: "sb-key" });
  });
});
