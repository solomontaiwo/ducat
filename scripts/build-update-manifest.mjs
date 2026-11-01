#!/usr/bin/env node
/**
 * Builds the `latest.json` static manifest consumed by the Tauri updater.
 *
 * It discovers the updater bundles and their `.sig` signatures inside the
 * directory produced by `actions/download-artifact`, renames the bundles to
 * URL-safe names, embeds the signature content, and writes `latest.json`.
 *
 * Each platform is disambiguated by the CI artifact name (e.g. `macos-arm64`),
 * never by the bundle filename, so multi-architecture builds can coexist in a
 * single GitHub Release.
 *
 * Usage (run from the repo root):
 *   node scripts/build-update-manifest.mjs \
 *     --downloaded ./downloaded \
 *     --repo solomontaiwo/ducat \
 *     --tag desktop-v4.0.0-run123-1 \
 *     --version 4.0.0 \
 *     --notes "Release notes (optional)" \
 *     --out ./release-assets
 */

import { readFile, writeFile, copyFile, mkdir } from "node:fs/promises";
import { glob } from "node:fs/promises";
import path from "node:path";

const argv = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) {
    if (fallback !== undefined) return fallback;
    console.error(`Missing required argument --${name}`);
    process.exit(1);
  }
  return process.argv[index + 1];
};

const downloadedDir = argv("downloaded");
const repo = argv("repo");
const tag = argv("tag");
const version = argv("version");
const notes = argv("notes", "");
const outDir = argv("out");
// Optional comma-separated list of platform keys (e.g. "darwin-aarch64").
// When omitted, every platform in PLATFORMS is expected and missing artifacts fail the build.
const selectedPlatforms = argv("platforms", "").split(",").filter(Boolean);

/** CI artifact name → updater manifest entry. */
const PLATFORMS = [
  {
    key: "darwin-aarch64",
    artifact: "macos-arm64",
    bundleGlob: "**/*.app.tar.gz",
    sigGlob: "**/*.app.tar.gz.sig",
    assetName: (v) => `Ducat-${v}-darwin-aarch64.app.tar.gz`,
  },
  {
    key: "darwin-x86_64",
    artifact: "macos-x64",
    bundleGlob: "**/*.app.tar.gz",
    sigGlob: "**/*.app.tar.gz.sig",
    assetName: (v) => `Ducat-${v}-darwin-x86_64.app.tar.gz`,
  },
  {
    key: "windows-x86_64",
    artifact: "windows-x64",
    bundleGlob: "**/*-setup.exe",
    sigGlob: "**/*-setup.exe.sig",
    assetName: (v) => `Ducat-${v}-windows-x86_64-setup.exe`,
  },
  {
    key: "windows-aarch64",
    artifact: "windows-arm64",
    bundleGlob: "**/*-setup.exe",
    sigGlob: "**/*-setup.exe.sig",
    assetName: (v) => `Ducat-${v}-windows-aarch64-setup.exe`,
  },
  {
    key: "linux-x86_64",
    // The Linux updater only supports AppImage. deb/rpm/pacman packages are
    // managed by the system package manager and must never appear here.
    artifact: "linux-appimage",
    bundleGlob: "**/*.AppImage",
    sigGlob: "**/*.AppImage.sig",
    assetName: (v) => `Ducat-${v}-linux-x86_64.AppImage`,
  },
];

async function findOne(base, pattern, artifact) {
  const matches = [];
  for await (const entry of glob(path.join(base, `ducat-${artifact}-*`, pattern))) {
    matches.push(entry);
  }
  if (matches.length !== 1) {
    console.error(
      `Expected exactly one ${pattern} for artifact "${artifact}", found ${matches.length}`,
    );
    process.exit(1);
  }
  return matches[0];
}

await mkdir(outDir, { recursive: true });

const platforms = {};
for (const platform of PLATFORMS) {
  if (selectedPlatforms.length > 0 && !selectedPlatforms.includes(platform.key)) continue;
  const base = path.resolve(downloadedDir);
  const bundle = await findOne(base, platform.bundleGlob, platform.artifact);
  const sig = await findOne(base, platform.sigGlob, platform.artifact);

  const signature = (await readFile(sig, "utf8")).trim();
  const assetName = platform.assetName(version);
  await copyFile(bundle, path.join(outDir, assetName));

  platforms[platform.key] = {
    signature,
    url: `https://github.com/${repo}/releases/download/${tag}/${assetName}`,
  };
}

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms,
};

await writeFile(path.join(outDir, "latest.json"), JSON.stringify(manifest, null, 2) + "\n");

console.log(`Wrote ${path.join(outDir, "latest.json")}`);
console.log(JSON.stringify(Object.keys(platforms), null, 0));
