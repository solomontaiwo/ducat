import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { describe, expect, it, vi } from "vitest";
import { buildAasa, readIosBundleId } from "../scripts/generate-aasa.mjs";

/**
 * Guards the app identity values used by the native shells.
 *
 * iOS and desktop have separate bundle identifiers. The iOS identifier must
 * remain aligned across Capacitor, Xcode and the Universal Links configuration.
 */

/* eslint-disable no-undef -- __dirname is provided by the Vitest transform */
const root = join(__dirname, "..");
/* eslint-enable no-undef */
const read = (path) => readFileSync(join(root, path), "utf8");
const readJson = (path) => JSON.parse(read(path));

const tauri = readJson("src-tauri/tauri.conf.json");
const capacitor = readJson("capacitor.config.json");
const manifest = readJson("public/manifest.json");
const iosVersion = readJson("ios/version.json").version;
const desktopVersion = readJson("package.json").version;
const pbxproj = read("ios/App/App.xcodeproj/project.pbxproj");
const infoPlist = read("ios/App/App/Info.plist");

const plistValue = (key) => {
  const match = new RegExp(`<key>${key}</key>\\s*<(string|true|false)>([^<]*)<`).exec(infoPlist);
  return match ? match[2] : undefined;
};

describe("app identity", () => {
  it("keeps the iOS bundle id aligned without changing the desktop identifier", () => {
    expect(capacitor.appId).toBe("com.ducatapp.ducat");
    expect(tauri.identifier).toBe("app.ducat");
    const identifiers = [...pbxproj.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((match) => match[1]);
    expect(identifiers.length).toBeGreaterThan(0);
    for (const identifier of identifiers) expect(identifier).toBe(capacitor.appId);
    expect(readIosBundleId()).toBe(capacitor.appId);
    const appId = `TESTTEAM123.${capacitor.appId}`;
    const aasa = buildAasa({ teamId: "TESTTEAM123", bundleId: readIosBundleId() });
    expect(aasa.applinks.details[0].appIDs).toContain(appId);
    expect(aasa.webcredentials.apps).toContain(appId);
  });

  it("uses one display name everywhere", () => {
    expect(capacitor.appName).toBe(tauri.productName);
    expect(manifest.name).toBe(tauri.productName);
    expect(manifest.short_name).toBe(tauri.productName);
    expect(plistValue("CFBundleDisplayName")).toBe(tauri.productName);
    expect(tauri.app.windows[0].title).toBe(tauri.productName);
  });

  it("keeps the Xcode marketing version aligned with the independent iOS version", () => {
    const versions = [...pbxproj.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((match) => match[1]);
    expect(versions.length).toBeGreaterThan(0);
    expect(iosVersion).toMatch(/^\d+\.\d+\.\d+$/);
    for (const version of versions) expect(version).toBe(iosVersion);
  });
});

describe("iOS version automation", () => {
  it("syncs iOS independently and leaves it unchanged when the desktop version bumps", () => {
    const temp = mkdtempSync(join(tmpdir(), "ducat-versions-"));
    try {
      for (const file of [
        "scripts/sync-ios-version.mjs", "scripts/bump-version.mjs", "ios/version.json",
        "ios/App/App.xcodeproj/project.pbxproj", "package.json", "package-lock.json",
        "src-tauri/Cargo.toml", "src-tauri/Cargo.lock",
      ]) {
        const target = join(temp, file);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(join(root, file), target);
      }
      const project = join(temp, "ios/App/App.xcodeproj/project.pbxproj");
      const stale = readFileSync(project, "utf8").replace(/(MARKETING_VERSION = )[^;]+;/g, (_, prefix) => `${prefix}9.8.7;`);
      writeFileSync(project, stale);
      execFileSync(process.execPath, [join(temp, "scripts/sync-ios-version.mjs")], {
        cwd: temp,
        env: { ...process.env, IOS_BUILD_NUMBER: "42" },
      });
      const synced = readFileSync(project, "utf8");
      expect(synced).toContain(`MARKETING_VERSION = ${iosVersion};`);
      expect(synced).toContain("CURRENT_PROJECT_VERSION = 42;");

      const previousVersion = JSON.parse(readFileSync(join(temp, "package.json"), "utf8")).version;
      execFileSync(process.execPath, [join(temp, "scripts/bump-version.mjs")], { cwd: temp });
      expect(JSON.parse(readFileSync(join(temp, "package.json"), "utf8")).version).not.toBe(previousVersion);
      expect(readFileSync(project, "utf8")).toBe(synced);
      expect(JSON.parse(readFileSync(join(temp, "ios/version.json"), "utf8")).version).toBe(iosVersion);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it.each([["mobile", iosVersion], ["desktop", desktopVersion], ["production", desktopVersion]])(
    "shows the correct version in %s mode",
    async (mode, expected) => {
      vi.stubEnv("MODE", mode);
      vi.resetModules();
      try {
        const { APP_VERSION } = await import("../src/utils/appVersion.js");
        expect(APP_VERSION).toBe(expected);
      } finally {
        vi.unstubAllEnvs();
        vi.resetModules();
      }
    }
  );
});

describe("iOS submission requirements", () => {
  it("declares no non-exempt encryption", () => {
    expect(infoPlist).toMatch(/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
  });

  it("declares Face ID usage description and compiles the native plugins, adaptive webview and privacy overlay", () => {
    expect(plistValue("NSFaceIDUsageDescription")).toBeTruthy();
    expect(existsSync(join(root, "ios/App/App/BiometricAuthPlugin.swift"))).toBe(true);
    expect(existsSync(join(root, "ios/App/App/NativeFeaturesPlugin.swift"))).toBe(true);
    expect(existsSync(join(root, "ios/App/App/MainViewController.swift"))).toBe(true);
    expect(pbxproj).toContain("BiometricAuthPlugin.swift in Sources");
    expect(pbxproj).toContain("NativeFeaturesPlugin.swift in Sources");
    expect(pbxproj).toContain("MainViewController.swift in Sources");
    const mainVc = read("ios/App/App/MainViewController.swift");
    expect(mainVc).toContain("BiometricAuthPlugin()");
    expect(mainVc).toContain("NativeFeaturesPlugin()");
    expect(mainVc).toContain(".systemBackground");
    const nativeFeatures = read("ios/App/App/NativeFeaturesPlugin.swift");
    expect(nativeFeatures).toContain("UNUserNotificationCenterDelegate");
    expect(nativeFeatures).toContain("consumePendingRoute");
    const splashContents = read("ios/App/App/Assets.xcassets/Splash.imageset/Contents.json");
    expect(splashContents).toContain('"value": "dark"');
    expect(capacitor.ios.backgroundColor).toBeUndefined();
    expect(capacitor.plugins?.SplashScreen?.backgroundColor).toBeUndefined();
    const sceneDelegate = read("ios/App/App/SceneDelegate.swift");
    expect(sceneDelegate).toContain("MainViewController()");
    expect(sceneDelegate).toContain("sceneWillResignActive");
    expect(sceneDelegate).toContain("UIVisualEffectView");
    expect(sceneDelegate).toContain("performActionFor shortcutItem");
    expect(infoPlist).toContain("UIApplicationShortcutItems");
    expect(infoPlist).toContain("app.ducat.quick-expense");
    expect(infoPlist).toContain("app.ducat.quick-income");
    const iosWorkflow = read(".github/workflows/ios.yml");
    expect(iosWorkflow).toContain("NativeFeaturesPlugin.swift");
    expect(iosWorkflow).toContain("NSFaceIDUsageDescription");
  });

  it("is a finance app for iPhone and iPad", () => {
    expect(plistValue("LSApplicationCategoryType")).toBe("public.app-category.finance");
    expect(pbxproj).toMatch(/TARGETED_DEVICE_FAMILY = "1,2";/);
    const orientations = /<key>UISupportedInterfaceOrientations<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(infoPlist)?.[1] ?? "";
    expect(orientations).toContain("UIInterfaceOrientationPortrait");
    expect(orientations).not.toContain("Landscape");
    const ipad = /<key>UISupportedInterfaceOrientations~ipad<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(infoPlist)?.[1] ?? "";
    expect(ipad).toContain("UIInterfaceOrientationLandscapeLeft");
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

  it("registers the deep-link scheme the app handles", () => {
    const urlScheme = infoPlist.match(/<key>CFBundleURLSchemes<\/key>\s*<array>\s*<string>([^<]+)<\/string>/)?.[1];
    // URL schemes are case-insensitive; src/platform/deepLinks.js matches `ducat:`.
    expect(urlScheme?.toLowerCase()).toBe("ducat");
  });

  it("points Capacitor at the shared Xcode scheme and names the product Ducat", () => {
    expect(existsSync(join(root, `ios/App/App.xcodeproj/xcshareddata/xcschemes/${capacitor.ios.scheme}.xcscheme`))).toBe(true);
    expect(pbxproj.match(/PRODUCT_NAME = Ducat;/g)).toHaveLength(2);
    expect(infoPlist).toMatch(/<key>CFBundleDisplayName<\/key>\s*<string>Ducat<\/string>/);
    expect(infoPlist).toContain("$(PRODUCT_MODULE_NAME).SceneDelegate");
  });

  it("wires Universal Links to the web domain", () => {
    const entitlementsPath = join(root, "ios/App/App/App.entitlements");
    expect(existsSync(entitlementsPath)).toBe(true);
    const entitlements = readFileSync(entitlementsPath, "utf8");
    expect(entitlements).toContain("com.apple.developer.associated-domains");
    expect(entitlements).toContain("applinks:");
    expect(pbxproj).toContain("CODE_SIGN_ENTITLEMENTS = App/App.entitlements;");
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
