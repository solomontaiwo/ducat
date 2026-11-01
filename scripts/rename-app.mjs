#!/usr/bin/env node
/**
 * Renames the app everywhere the name and the bundle id are duplicated.
 *
 * The product name is still a placeholder; this script keeps the single
 * sources of truth (the Tauri config and the Capacitor config) and propagates
 * the change to the files that hard-code the string, so a rename is one command
 * instead of a hunt through the repository.
 *
 * The bundle id is the part that cannot be changed after the first upload to
 * App Store Connect: choose it once, from a domain you own.
 *
 * Usage:
 *   node scripts/rename-app.mjs --name "Gruzzolo" --id app.gruzzolo
 *   node scripts/rename-app.mjs --name "Gruzzolo"           # keep the bundle id
 *   node scripts/rename-app.mjs --dry-run --name "Gruzzolo" --id app.gruzzolo
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

const readArg = (name) => {
  const index = args.indexOf(`--${name}`);
  return index > -1 ? args[index + 1] : undefined;
};

const name = readArg("name");
const bundleId = readArg("id");

if (!name && !bundleId) {
  console.error('Usage: node scripts/rename-app.mjs --name "Gruzzolo" [--id app.gruzzolo] [--dry-run]');
  process.exit(1);
}

if (name !== undefined) {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 30) {
    console.error("The App Store name must be between 2 and 30 characters");
    process.exit(1);
  }
  if (!/^[\p{L}\p{N} .'’&+-]+$/u.test(trimmed)) {
    console.error("The name contains characters the App Store rejects");
    process.exit(1);
  }
}

if (bundleId !== undefined) {
  if (!/^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z0-9-]+)+$/.test(bundleId)) {
    console.error("The bundle id must look like a reverse domain, e.g. app.gruzzolo");
    process.exit(1);
  }
  if (bundleId.startsWith("io.github.")) {
    console.error("io.github.* is not a domain you own: pick your own reverse domain");
    process.exit(1);
  }
}

const changes = [];

const editFile = (relativePath, transform) => {
  const path = join(ROOT, relativePath);
  const before = readFileSync(path, "utf8");
  const after = transform(before);
  if (after !== before) {
    changes.push(relativePath);
    if (!dryRun) writeFileSync(path, after);
  }
};

const editJson = (relativePath, transform) => {
  editFile(relativePath, (text) => {
    const data = JSON.parse(text);
    transform(data);
    return `${JSON.stringify(data, null, 2)}\n`;
  });
};

const escapeHtml = (value) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

if (name) {
  editJson("src-tauri/tauri.conf.json", (data) => {
    data.productName = name;
    for (const window of data.app?.windows ?? []) window.title = name;
    if (bundleId) data.identifier = bundleId;
  });
  editJson("capacitor.config.json", (data) => {
    data.appName = name;
    if (bundleId) data.appId = bundleId;
  });
  editJson("public/manifest.json", (data) => {
    data.name = name;
    data.short_name = name;
  });
  editJson("package.json", (data) => {
    data.name = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  });
  editFile("index.html", (text) => text.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(name)}</title>`));
  editFile("src-tauri/Cargo.toml", (text) => text.replace(/^authors = \[.*\]$/m, `authors = ["${name}"]`));
  for (const locale of ["it", "en"]) {
    editJson(`src/locales/${locale}/translation.json`, (data) => {
      data.appName = name;
    });
  }
  editFile("ios/App/App/Info.plist", (text) =>
    text.replace(/(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/, `$1${escapeHtml(name)}$2`)
  );
  editFile("tests/e2e/app.spec.js", (text) => text.replace(/toHaveTitle\(\/[^/]*\/i\)/, `toHaveTitle(/${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/i)`));
}

if (bundleId) {
  editFile("ios/App/App.xcodeproj/project.pbxproj", (text) =>
    text.replace(/(PRODUCT_BUNDLE_IDENTIFIER = )[^;]+;/g, `$1${bundleId};`)
  );
  editJson("src-tauri/tauri.conf.json", (data) => {
    data.identifier = bundleId;
  });
  editJson("capacitor.config.json", (data) => {
    data.appId = bundleId;
  });
}

if (changes.length === 0) {
  console.log("Nothing to change");
} else {
  console.log(`${dryRun ? "Would update" : "Updated"}:`);
  for (const path of [...new Set(changes)].sort()) console.log(`  - ${path}`);
  if (bundleId) {
    console.log("\nRemember: after the first upload the bundle id is permanent.");
  }
  console.log("Next: npm run ios:sync && npm run desktop:build (run the tests too)");
}
