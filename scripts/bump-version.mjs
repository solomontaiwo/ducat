#!/usr/bin/env node
/**
 * Bumps the patch version across every place the app version lives, keeping
 * them aligned: package.json, package-lock.json and src-tauri/Cargo.toml.
 *
 * The Tauri app version is read from package.json via `tauri.conf.json`
 * (`"version": "../package.json"`), so this is the single source of truth for
 * the updater. Cargo.toml is kept in sync for consistency.
 *
 * Usage: node scripts/bump-version.mjs   # prints the new version
 */

import { readFileSync, writeFileSync } from "node:fs";

const PKG = "package.json";
const LOCK = "package-lock.json";
const CARGO = "src-tauri/Cargo.toml";
const CARGO_LOCK = "src-tauri/Cargo.lock";
const PBXPROJ = "ios/App/App.xcodeproj/project.pbxproj";

/** 4.0.0 -> 4.0.1 ; 4.0.0-beta.1 -> 4.0.1 (prerelease is dropped on patch). */
function bumpPatch(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!match) throw new Error(`Unsupported version format: ${version}`);
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

const pkg = JSON.parse(readFileSync(PKG, "utf8"));
const next = bumpPatch(pkg.version);

pkg.version = next;
writeFileSync(PKG, `${JSON.stringify(pkg, null, 2)}\n`);

const lock = JSON.parse(readFileSync(LOCK, "utf8"));
lock.version = next;
if (lock.packages && lock.packages[""]) lock.packages[""].version = next;
writeFileSync(LOCK, `${JSON.stringify(lock, null, 2)}\n`);

const cargo = readFileSync(CARGO, "utf8");
if (!/^version\s*=\s*"[^"]*"/m.test(cargo)) {
  throw new Error(`Could not find a top-level version line in ${CARGO}`);
}
const crateName = /^name\s*=\s*"([^"]+)"/m.exec(cargo)?.[1];
if (!crateName) throw new Error(`Could not find the crate name in ${CARGO}`);
writeFileSync(CARGO, cargo.replace(/^version\s*=\s*"[^"]*"/m, `version = "${next}"`));

// Cargo.lock keeps the resolved version of our own crate: leaving it behind
// makes every local cargo run rewrite the file.
const cargoLock = readFileSync(CARGO_LOCK, "utf8");
const cargoEntry = new RegExp(`(\\[\\[package\\]\\]\\nname = "${crateName}"\\nversion = ")[^"]*(")`, "m");
if (!cargoEntry.test(cargoLock)) {
  throw new Error(`Could not find the ${crateName} entry in ${CARGO_LOCK}`);
}
writeFileSync(CARGO_LOCK, cargoLock.replace(cargoEntry, `$1${next}$2`));

// Xcode reads MARKETING_VERSION (CFBundleShortVersionString): the App Store
// rejects an upload whose version does not match the release.
const pbxproj = readFileSync(PBXPROJ, "utf8");
writeFileSync(PBXPROJ, pbxproj.replace(/(MARKETING_VERSION = )[^;]+;/g, `$1${next};`));

console.log(next);
