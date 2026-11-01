#!/usr/bin/env node
/**
 * Builds the Mac App Store package (`.pkg`) for the Tauri app.
 *
 * The store build differs from the GitHub release in four ways:
 * - `src-tauri/tauri.mas.conf.json` enables the App Sandbox entitlements,
 *   disables the updater artifacts and sets the App Store category;
 * - the binary is universal (Apple Silicon + Intel), because a store listing
 *   ships one build for every Mac;
 * - the app is signed with an "Apple Distribution" identity and carries the
 *   Mac App Store provisioning profile;
 * - the `.pkg` is signed with a "3rd Party Mac Developer Installer" identity.
 *
 * Required environment variables (they are secrets: never commit them):
 *   APPLE_SIGNING_IDENTITY      "Apple Distribution: Name (TEAMID)"
 *   APPLE_INSTALLER_IDENTITY    "3rd Party Mac Developer Installer: Name (TEAMID)"
 *   APPLE_PROVISIONING_PROFILE  path to the .provisionprofile downloaded from
 *                               the Apple Developer portal
 *
 * Optional:
 *   APPLE_TEAM_ID               used to sanity-check the profile
 *   VITE_APP_STORE=1            hides every self-update entry point
 *   SKIP_BUILD=1                reuse the last tauri build output
 *
 * Usage: node scripts/build-macos-appstore.mjs [--check]
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const TARGET = "universal-apple-darwin";
const tauriConfig = JSON.parse(readFileSync(join(ROOT, "src-tauri", "tauri.conf.json"), "utf8"));
const APP_NAME = tauriConfig.productName;
const BUNDLE_ID = tauriConfig.identifier;
const APP_PATH = join(ROOT, "src-tauri", "target", TARGET, "release", "bundle", "macos", `${APP_NAME}.app`);
const OUTPUT_DIR = join(ROOT, "src-tauri", "target", "appstore");

const checkOnly = process.argv.includes("--check");

const run = (command, args, options = {}) => {
  console.log(`$ ${command} ${args.join(" ")}`);
  return execFileSync(command, args, { cwd: ROOT, stdio: "inherit", ...options });
};

const read = (command, args) =>
  execFileSync(command, args, { cwd: ROOT, encoding: "utf8" }).trim();

const loadVersion = () => JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;

const requireEnv = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const verifyEnvironment = () => {
  const signingIdentity = requireEnv("APPLE_SIGNING_IDENTITY");
  const installerIdentity = requireEnv("APPLE_INSTALLER_IDENTITY");
  const profile = requireEnv("APPLE_PROVISIONING_PROFILE");

  if (!signingIdentity.startsWith("Apple Distribution") && !signingIdentity.startsWith("3rd Party Mac Developer Application")) {
    throw new Error("APPLE_SIGNING_IDENTITY must be an Apple Distribution (or 3rd Party Mac Developer Application) identity");
  }
  if (!installerIdentity.startsWith("3rd Party Mac Developer Installer")) {
    throw new Error("APPLE_INSTALLER_IDENTITY must be a 3rd Party Mac Developer Installer identity");
  }
  if (!existsSync(profile)) throw new Error(`Provisioning profile not found: ${profile}`);

  // The profile is a CMS envelope with an embedded plist: look for the app id
  // and the team to catch the classic "wrong profile" upload error early.
  const raw = read("security", ["cms", "-D", "-i", profile]);
  const teamId = process.env.APPLE_TEAM_ID;
  if (teamId && !raw.includes(teamId)) {
    throw new Error(`The provisioning profile does not belong to team ${teamId}`);
  }
  if (!raw.includes(BUNDLE_ID)) {
    console.warn(`Warning: the provisioning profile does not mention ${BUNDLE_ID}`);
  }

  return { signingIdentity, installerIdentity, profile };
};

const build = () => {
  if (process.env.SKIP_BUILD === "1") {
    console.log("SKIP_BUILD=1: reusing the existing bundle");
    return;
  }
  run("npm", [
    "run", "tauri", "--", "build",
    "--target", TARGET,
    "--bundles", "app",
    "--config", "src-tauri/tauri.mas.conf.json",
  ]);
};

const signApp = ({ signingIdentity, profile }) => {
  const profileTarget = join(APP_PATH, "Contents", "embedded.provisionprofile");
  copyFileSync(profile, profileTarget);

  // Tauri already signed the bundle with the same identity; re-sign explicitly
  // so the entitlements and the embedded profile are part of the signature.
  run("codesign", [
    "--force", "--deep", "--timestamp", "--options", "runtime",
    "--entitlements", join(ROOT, "src-tauri", "entitlements", "AppStore.entitlements"),
    "--sign", signingIdentity,
    APP_PATH,
  ]);

  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", APP_PATH]);
};

const verifyEntitlements = () => {
  const entitlements = read("codesign", ["--display", "--entitlements", "-", APP_PATH]);
  const required = [
    "com.apple.security.app-sandbox",
    "com.apple.security.network.client",
    "com.apple.security.files.user-selected.read-write",
  ];
  const missing = required.filter((key) => !entitlements.includes(key));
  if (missing.length > 0) {
    throw new Error(`Signed app is missing entitlements: ${missing.join(", ")}`);
  }
  console.log("Entitlements verified");
};

const buildPackage = ({ installerIdentity }) => {
  const version = loadVersion();
  const pkgPath = join(OUTPUT_DIR, `Soldi-Sotto-${version}-mac-app-store.pkg`);
  rmSync(pkgPath, { force: true });
  run("productbuild", [
    "--component", APP_PATH, "/Applications",
    "--sign", installerIdentity,
    pkgPath,
  ]);
  run("pkgutil", ["--check-signature", pkgPath]);
  return pkgPath;
};

const main = () => {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`Mac App Store build · ${loadVersion()} · ${TARGET}`);
  const environment = verifyEnvironment();
  if (checkOnly) {
    console.log("Environment looks good (--check: nothing was built)");
    return;
  }
  build();
  if (!existsSync(APP_PATH)) throw new Error(`App bundle not found: ${APP_PATH}`);
  signApp(environment);
  verifyEntitlements();
  const pkgPath = buildPackage(environment);
  console.log(`\nPackage ready: ${pkgPath}`);
  console.log("Upload it to App Store Connect with Transporter or:");
  console.log(`  xcrun altool --upload-app -f "${pkgPath}" -t macos --apiKey <KEY_ID> --apiIssuer <ISSUER_ID>`);
};

try {
  main();
} catch (error) {
  console.error(`\nApp Store build failed: ${error.message}`);
  process.exit(1);
}
