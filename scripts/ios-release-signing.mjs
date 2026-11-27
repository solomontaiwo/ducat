#!/usr/bin/env node
/**
 * Switches the iOS release build to manual App Store signing, for CI.
 *
 * The Xcode project uses automatic signing, which suits local development.
 * On a CI runner, automatic signing finds no development certificate in the
 * fresh keychain and creates a new one on every run, until Apple's
 * certificate limit is reached and archiving fails. CI already installs the
 * Apple Distribution certificate and the App Store profile, so the archive is
 * signed with those instead.
 *
 * Only the App target's Release configuration is changed (passing the profile
 * on the xcodebuild command line would also apply it to the Swift packages,
 * which cannot take one). The export options are written next to it.
 *
 * Usage: node scripts/ios-release-signing.mjs <profile-uuid> <team-id> <export-options-out>
 */

import { readFileSync, writeFileSync } from "node:fs";

const PROJECT = "ios/App/App.xcodeproj/project.pbxproj";
const EXPORT_OPTIONS = "ios/ExportOptions.plist";
const BUNDLE_ID = "com.ducatapp.ducat";
const IDENTITY = "Apple Distribution";

/** Returns the project with the App target's Release configuration signed manually. */
export function signReleaseManually(project, profileUuid) {
  const block = /(\/\* Release \*\/ = \{\s*isa = XCBuildConfiguration;\s*buildSettings = \{)([\s\S]*?)(\};\s*name = Release;)/g;
  let changed = 0;
  const next = project.replace(block, (match, head, settings, tail) => {
    if (!settings.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${BUNDLE_ID};`)) return match;
    changed += 1;
    const manual = settings
      .replace(/CODE_SIGN_STYLE = Automatic;/, "CODE_SIGN_STYLE = Manual;")
      .replace(/\n(\t+)CODE_SIGN_STYLE = Manual;/, (line, indent) => [
        line,
        `\n${indent}CODE_SIGN_IDENTITY = "${IDENTITY}";`,
        `\n${indent}"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "${IDENTITY}";`,
        `\n${indent}PROVISIONING_PROFILE_SPECIFIER = "${profileUuid}";`,
      ].join(""));
    return head + manual + tail;
  });
  if (changed !== 1 || !next.includes(`PROVISIONING_PROFILE_SPECIFIER = "${profileUuid}";`)) {
    throw new Error("Could not find the App target's Release configuration to sign");
  }
  return next;
}

/** Returns the export options for a manually signed App Store export. */
export function manualExportOptions(options, profileUuid, teamId) {
  const entries = [
    "\t<key>signingStyle</key>\n\t<string>manual</string>",
    `\t<key>signingCertificate</key>\n\t<string>${IDENTITY}</string>`,
    `\t<key>teamID</key>\n\t<string>${teamId}</string>`,
    `\t<key>provisioningProfiles</key>\n\t<dict>\n\t\t<key>${BUNDLE_ID}</key>\n\t\t<string>${profileUuid}</string>\n\t</dict>`,
  ].join("\n");
  const withoutStyle = options.replace(/\t<key>signingStyle<\/key>\s*<string>[^<]*<\/string>\n/, "");
  return withoutStyle.replace(/<\/dict>\s*<\/plist>\s*$/, `${entries}\n</dict>\n</plist>\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [profileUuid, teamId, exportOut] = process.argv.slice(2);
  if (!/^[0-9A-Fa-f-]{36}$/.test(profileUuid ?? "") || !teamId || !exportOut) {
    console.error("Usage: node scripts/ios-release-signing.mjs <profile-uuid> <team-id> <export-options-out>");
    process.exit(1);
  }
  writeFileSync(PROJECT, signReleaseManually(readFileSync(PROJECT, "utf8"), profileUuid));
  writeFileSync(exportOut, manualExportOptions(readFileSync(EXPORT_OPTIONS, "utf8"), profileUuid, teamId));
  console.log("Release signing: manual, App Store profile", profileUuid);
}
