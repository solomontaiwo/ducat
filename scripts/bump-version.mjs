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
writeFileSync(CARGO, cargo.replace(/^version\s*=\s*"[^"]*"/m, `version = "${next}"`));

console.log(next);
