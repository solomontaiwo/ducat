import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the values that must stay aligned across the two native shells.
 *
 * The name and the bundle id live in several files (Tauri, Capacitor, Xcode,
 * the PWA manifest). `scripts/rename-app.mjs` updates them together; these
 * tests fail when a rename or a hand edit leaves one of them behind, because a
 * mismatch only shows up at upload time otherwise.
 */

/* eslint-disable no-undef -- __dirname is provided by the Vitest transform */
const root = join(__dirname, "..");
/* eslint-enable no-undef */
const read = (path) => readFileSync(join(root, path), "utf8");
const readJson = (path) => JSON.parse(read(path));

const tauri = readJson("src-tauri/tauri.conf.json");
const capacitor = readJson("capacitor.config.json");
const manifest = readJson("public/manifest.json");
const pkg = readJson("package.json");
const pbxproj = read("ios/App/App.xcodeproj/project.pbxproj");
const infoPlist = read("ios/App/App/Info.plist");

const plistValue = (key) => {
  const match = new RegExp(`<key>${key}</key>\\s*<(string|true|false)>([^<]*)<`).exec(infoPlist);
  return match ? match[2] : undefined;
};

describe("app identity", () => {
  it("uses one bundle id across Tauri, Capacitor and Xcode", () => {
    expect(capacitor.appId).toBe(tauri.identifier);
    const identifiers = [...pbxproj.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((match) => match[1]);
    expect(identifiers.length).toBeGreaterThan(0);
    for (const identifier of identifiers) expect(identifier).toBe(tauri.identifier);
  });

  it("uses one display name everywhere", () => {
    expect(capacitor.appName).toBe(tauri.productName);
    expect(manifest.name).toBe(tauri.productName);
    expect(manifest.short_name).toBe(tauri.productName);
    expect(plistValue("CFBundleDisplayName")).toBe(tauri.productName);
    expect(tauri.app.windows[0].title).toBe(tauri.productName);
  });

  it("keeps the Xcode marketing version aligned with package.json", () => {
    const versions = [...pbxproj.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((match) => match[1]);
    expect(versions.length).toBeGreaterThan(0);
    for (const version of versions) expect(version).toBe(pkg.version);
  });
});

describe("iOS submission requirements", () => {
  it("declares no non-exempt encryption", () => {
    expect(infoPlist).toMatch(/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
  });

  it("is a finance app, iPhone only, portrait", () => {
    expect(plistValue("LSApplicationCategoryType")).toBe("public.app-category.finance");
    expect(pbxproj).toMatch(/TARGETED_DEVICE_FAMILY = 1;/);
    const orientations = /<key>UISupportedInterfaceOrientations<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(infoPlist)?.[1] ?? "";
    expect(orientations).toContain("UIInterfaceOrientationPortrait");
    expect(orientations).not.toContain("Landscape");
  });

  it("ships a privacy manifest as a bundle resource", () => {
    expect(existsSync(join(root, "ios/App/App/PrivacyInfo.xcprivacy"))).toBe(true);
    expect(pbxproj).toContain("PrivacyInfo.xcprivacy in Resources");
    const privacy = read("ios/App/App/PrivacyInfo.xcprivacy");
    for (const api of ["NSPrivacyAccessedAPICategoryUserDefaults", "NSPrivacyAccessedAPICategoryFileTimestamp"]) {
      expect(privacy).toContain(api);
    }
    expect(privacy).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/);
  });

  it("registers the deep-link scheme", () => {
    expect(infoPlist).toContain(capacitor.ios.scheme);
  });

  it("ships an opaque 1024px icon", () => {
    const icon = readFileSync(join(root, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"));
    // PNG IHDR: width at byte 16, height at 20, colour type at 25.
    expect(icon.readUInt32BE(16)).toBe(1024);
    expect(icon.readUInt32BE(20)).toBe(1024);
    // Colour type 6 carries alpha; the App Store rejects icons with alpha.
    expect(icon[25]).not.toBe(6);
  });
});

describe("Mac App Store build", () => {
  const mas = readJson("src-tauri/tauri.mas.conf.json");

  it("builds only the .app bundle and no updater artifacts", () => {
    expect(mas.bundle.targets).toEqual(["app"]);
    expect(mas.bundle.createUpdaterArtifacts).toBe(false);
  });

  it("points at existing entitlements and Info.plist", () => {
    expect(existsSync(join(root, "src-tauri", mas.bundle.macOS.entitlements))).toBe(true);
    expect(existsSync(join(root, "src-tauri", mas.bundle.macOS.infoPlist))).toBe(true);
  });

  it("enables the App Sandbox with only the permissions the app needs", () => {
    const entitlements = read("src-tauri/entitlements/AppStore.entitlements");
    for (const key of [
      "com.apple.security.app-sandbox",
      "com.apple.security.network.client",
      "com.apple.security.files.user-selected.read-write",
    ]) {
      expect(entitlements).toContain(key);
    }
    expect(entitlements).not.toContain("com.apple.security.network.server");
    expect(entitlements).not.toContain("com.apple.security.cs.disable-library-validation");
  });

  it("does not leave the updater endpoint active", () => {
    expect(mas.plugins.updater.endpoints).toEqual([]);
  });
});
