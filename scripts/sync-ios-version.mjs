#!/usr/bin/env node
/**
 * Keeps the Xcode project version in sync with the repository version.
 *
 * App Store Connect requires CFBundleShortVersionString (MARKETING_VERSION) to
 * match the release and CFBundleVersion (CURRENT_PROJECT_VERSION) to grow with
 * every upload. The marketing version comes from package.json; the build number
 * comes from IOS_BUILD_NUMBER when set (CI uses the run number) and defaults to
 * the previous value locally.
 *
 * Usage:
 *   node scripts/sync-ios-version.mjs
 *   IOS_BUILD_NUMBER=42 node scripts/sync-ios-version.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const PROJECT = join(ROOT, "ios", "App", "App.xcodeproj", "project.pbxproj");

const { version } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const buildNumber = process.env.IOS_BUILD_NUMBER;

const current = readFileSync(PROJECT, "utf8");
let next = current.replace(/(MARKETING_VERSION = )[^;]+;/g, `$1${version};`);

if (buildNumber) {
  if (!/^\d+$/.test(buildNumber)) throw new Error(`IOS_BUILD_NUMBER must be an integer, got ${buildNumber}`);
  next = next.replace(/(CURRENT_PROJECT_VERSION = )[^;]+;/g, `$1${buildNumber};`);
}

if (next === current) {
  console.log(`iOS version already in sync (${version}${buildNumber ? ` build ${buildNumber}` : ""})`);
} else {
  writeFileSync(PROJECT, next);
  const build = (next.match(/CURRENT_PROJECT_VERSION = ([^;]+);/) ?? [])[1];
  console.log(`iOS version set to ${version} (build ${build})`);
}
