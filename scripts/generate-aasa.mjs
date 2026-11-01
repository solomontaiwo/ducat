#!/usr/bin/env node
/**
 * Writes the Apple App Site Association file for Universal Links.
 *
 * iOS fetches `https://<domain>/.well-known/apple-app-site-association` before
 * it opens app links. The file must be served as JSON with no redirects, and
 * the appID is `<TeamID>.<bundle id>`: the Team ID is not in the repository, so
 * it comes from the environment at build time.
 *
 * Usage: APPLE_TEAM_ID=ABCDE12345 node scripts/generate-aasa.mjs
 * Env:
 *   APPLE_TEAM_ID  (required in CI) Apple Developer team identifier
 *   AASA_DOMAIN    host that serves the app, defaults to VITE_DESKTOP_WEB_URL
 */

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");

/** Paths that must open in the app instead of the browser. */
const PATHS = [
  "/dashboard",
  "/transactions",
  "/analytics",
  "/profile",
  "/reset-password",
  "/verify-email",
  "/*",
];

export const buildAasa = ({ teamId, bundleId }) => ({
  applinks: {
    details: [
      {
        appIDs: [`${teamId}.${bundleId}`],
        components: PATHS.map((path) => ({ "/": path })),
      },
    ],
    // Keep the legacy key for iOS versions that still read it.
    apps: [],
  },
  webcredentials: { apps: [`${teamId}.${bundleId}`] },
});

const main = () => {
  const { identifier } = JSON.parse(readFileSync(join(ROOT, "src-tauri", "tauri.conf.json"), "utf8"));
  const teamId = process.env.APPLE_TEAM_ID || "TEAMID";
  const publicBase = process.env.VITE_DESKTOP_WEB_URL || "https://solomontaiwo.github.io/ducat/";
  const domain = process.env.AASA_DOMAIN || (() => {
    try {
      return new URL(publicBase).host;
    } catch {
      return "";
    }
  })();

  if (!process.env.APPLE_TEAM_ID) {
    const message = "APPLE_TEAM_ID is not set: writing the AASA with a placeholder";
    if (process.env.AASA_REQUIRE_TEAM_ID === "1") {
      console.error(`${message}. Set the secret before deploying.`);
      process.exit(1);
    }
    console.warn(`${message}. Universal Links will not work in this build.`);
  }

  const target = join(ROOT, "dist", ".well-known", "apple-app-site-association");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(buildAasa({ teamId, bundleId: identifier }), null, 2)}\n`);
  console.log(`Wrote ${target} for ${teamId}.${identifier} on ${domain || "unknown domain"}`);
};

if (import.meta.url === `file://${process.argv[1]}`) main();
