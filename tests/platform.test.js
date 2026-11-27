import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DESKTOP, MOBILE, WEB, isDesktop, isMobile, isStoreBuild, isWeb, runtime } from "../src/platform/index.js";
import { blobToBase64, safeFilename, saveFile } from "../src/platform/files.js";
import { isAllowedExternalUrl, openExternal } from "../src/platform/links.js";
import { hapticSuccess, hapticTap } from "../src/platform/haptics.js";
import { archiveKeychain, authStorage, hasStoredAuthSession, nativeAuthStorage } from "../src/platform/authStorage.js";
import { buildFeedbackMailto } from "../src/utils/feedback.js";

const shareMock = vi.fn(async () => ({}));
const writeFileMock = vi.fn(async () => ({ uri: "file:///cache/report.pdf" }));
const deleteFileMock = vi.fn(async () => undefined);
const saveDialogMock = vi.fn(async () => "/tmp/report.pdf");
const writeTauriFileMock = vi.fn(async () => undefined);
const browserOpenMock = vi.fn(async () => undefined);
const impactMock = vi.fn(async () => undefined);
const notificationHapticMock = vi.fn(async () => undefined);
const archiveMock = vi.hoisted(() => ({
  removeSecret: vi.fn(async () => undefined),
  archiveKeyStatus: vi.fn(async () => ({ available: true, configured: true })),
  unlockArchiveKey: vi.fn(async () => ({ value: "archive-key" })),
  saveArchiveKey: vi.fn(async () => undefined),
  removeArchiveKey: vi.fn(async () => undefined),
}));
const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@capacitor/core", async (importOriginal) => ({
  ...await importOriginal(),
  registerPlugin: () => archiveMock,
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
const preferencesMock = vi.hoisted(() => ({
  get: vi.fn(async () => ({ value: "stored" })),
  set: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
}));

vi.mock("@capacitor/share", () => ({ Share: { share: shareMock } }));
vi.mock("@capacitor/filesystem", () => ({
  Filesystem: { writeFile: writeFileMock, deleteFile: deleteFileMock },
  Directory: { Cache: "CACHE" },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: saveDialogMock }));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeFile: writeTauriFileMock }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(async () => undefined) }));
vi.mock("@capacitor/browser", () => ({ Browser: { open: browserOpenMock } }));
vi.mock("@capacitor/haptics", () => ({
  Haptics: { impact: impactMock, notification: notificationHapticMock },
  ImpactStyle: { Light: "LIGHT", Medium: "MEDIUM", Heavy: "HEAVY" },
  NotificationType: { Success: "SUCCESS" },
}));
vi.mock("@capacitor/preferences", () => ({ Preferences: preferencesMock }));

const pdf = () => new Blob([new Uint8Array([37, 80, 68, 70])], { type: "application/pdf" });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
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
    expect(deleteFileMock).toHaveBeenCalledWith({ path: "report.pdf", directory: "CACHE" });
  });

  it("returns false without throwing when the iOS share sheet is cancelled", async () => {
    vi.stubEnv("MODE", "mobile");
    shareMock.mockRejectedValueOnce(new Error("Share canceled"));
    await expect(saveFile(pdf(), "report.pdf")).resolves.toBe(false);
    expect(deleteFileMock).toHaveBeenCalledWith({ path: "report.pdf", directory: "CACHE" });
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

  it("taps and signals success on iOS", async () => {
    vi.stubEnv("MODE", "mobile");
    await expect(hapticTap("medium")).resolves.toBe(true);
    expect(impactMock).toHaveBeenCalledWith({ style: "MEDIUM" });
    await expect(hapticSuccess()).resolves.toBe(true);
    expect(notificationHapticMock).toHaveBeenCalledWith({ type: "SUCCESS" });
  });
});

describe("feedback mailto", () => {
  it("builds a mailto URL with technical diagnostics and no personal data", () => {
    vi.stubEnv("MODE", "mobile");
    const link = buildFeedbackMailto({ language: "it", subjectPrefix: "Feedback", promptLine: "Dettagli:" });
    expect(isAllowedExternalUrl(link)).toBe(true);
    expect(link).toContain("mailto:");
    expect(link).toContain("iOS");
    expect(link).toContain("Language%3A%20it");
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
    await expect(hasStoredAuthSession("sb-key")).resolves.toBe(true);
    await nativeAuthStorage.setItem("sb-key", "value");
    expect(preferencesMock.set).toHaveBeenCalledWith({ key: "sb-key", value: "value" });
    await nativeAuthStorage.removeItem("sb-key");
    expect(preferencesMock.remove).toHaveBeenCalledWith({ key: "sb-key" });
  });

  it("checks localStorage for stored sessions on web", async () => {
    vi.stubEnv("MODE", "production");
    localStorage.clear();
    await expect(hasStoredAuthSession("sb-web")).resolves.toBe(false);
    localStorage.setItem("sb-web", '{"access_token":"tok"}');
    await expect(hasStoredAuthSession("sb-web")).resolves.toBe(true);
    localStorage.clear();
  });
});


describe("protected archive key", () => {
  it("removes the previous iOS entry and opens only through the protected Keychain", async () => {
    vi.stubEnv("MODE", "mobile");
    await expect(archiveKeychain.status("u1")).resolves.toEqual({ available: true, configured: true });
    expect(archiveMock.removeSecret).toHaveBeenCalledWith({ key: "ducat-archive-key:u1" });
    expect(archiveMock.unlockArchiveKey).not.toHaveBeenCalled();
    await expect(archiveKeychain.get("u1", "Unlock")).resolves.toBe("archive-key");
    expect(archiveMock.unlockArchiveKey).toHaveBeenCalledWith({ uid: "u1", reason: "Unlock" });
    await expect(archiveKeychain.set("u1", "archive-key")).resolves.toBe(true);
    expect(archiveMock.saveArchiveKey).toHaveBeenCalledWith({ uid: "u1", value: "archive-key" });
    await archiveKeychain.remove("u1");
    expect(archiveMock.removeArchiveKey).toHaveBeenCalledWith({ uid: "u1" });
    expect(preferencesMock.set).not.toHaveBeenCalled();
  });

  it("uses native archive commands on macOS and keeps cancellation available for manual unlock", async () => {
    vi.stubEnv("MODE", "desktop");
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    invokeMock.mockResolvedValueOnce({ available: true, configured: true }).mockRejectedValueOnce("userCancel");
    await expect(archiveKeychain.status("u1")).resolves.toEqual({ available: true, configured: true });
    await expect(archiveKeychain.get("u1", "Unlock")).rejects.toBe("userCancel");
    expect(invokeMock).toHaveBeenNthCalledWith(1, "archive_key_status", { uid: "u1" });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "unlock_archive_key", { uid: "u1" });
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it.each([["production", "MacIntel"], ["desktop", "Win32"]])("keeps archive keys out of platform storage on %s / %s", async (mode, platform) => {
    vi.stubEnv("MODE", mode);
    vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
    await expect(archiveKeychain.status("u1")).resolves.toEqual({ available: false, configured: false });
    await expect(archiveKeychain.get("u1", "Unlock")).resolves.toBeNull();
    await expect(archiveKeychain.set("u1", "archive-key")).resolves.toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
    expect(archiveMock.saveArchiveKey).not.toHaveBeenCalled();
  });
});
