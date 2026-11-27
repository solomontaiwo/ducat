# Ducat

Ducat is a personal finance app for the **web, desktop** (macOS, Windows) **and iPhone/iPad**. It is built with React and Vite, packaged with Tauri 2 on the desktop and Capacitor on iOS, and uses Supabase (PostgreSQL, Auth and Realtime) as the backend.

**Web app:** [ducatapp.com](https://ducatapp.com), served by Cloudflare Workers (static assets).
**Source:** [solomontaiwo/ducat](https://github.com/solomontaiwo/ducat).

### The name

The ducat is the gold coin Venice first minted in 1284, and for centuries it
was the currency of Mediterranean trade. The name comes from Latin *ducatus*,
"duchy": the duke's coin, made to travel and to be looked after.

## Features

- **Accounts and login** — email/password accounts with password reset and email change, plus a local demo mode that needs no backend.
- **Income and expenses** — add, edit and delete transactions with categories, search and a chronological view.
- **Budgets and recurring expenses** — monthly limits per category and recurring rules.
- **Analytics and insights** — KPI tiles, monthly income/expense trend, spending by category and comparisons with the previous period.
- **Backups and exports** — JSON backup/restore plus CSV and PDF reports.
- **Desktop auto-updates** — the app checks for updates, shows the changelog and installs signed updates on supported release platforms.
- **Cross-platform** — web, macOS Apple Silicon, Windows x64 and ARM64, and iPhone/iPad.
- **Themes and languages** — light/dark/system theme and Italian/English.
- **iPhone app** — the same React app packaged with Capacitor, with share-sheet
  exports, native haptics, native pull to refresh, Home Screen quick actions
  and the session kept in native preferences. On the iPhone Duo outer screen
  the tab bar moves into the system vertical bar.

## Technologies

- **React + Vite** — user interface.
- **Tauri 2 (Rust)** — desktop shell, installers and signed auto-updates.
- **Capacitor 8** — iOS shell: share sheet, haptics, native preferences.
- **Supabase** — Auth, PostgreSQL protected by row level security, Realtime sync between devices.

## Getting started (web)

Requirements: Node.js 24 and a Supabase project (see [docs/SUPABASE.md](docs/SUPABASE.md) for the full setup).

```bash
git clone https://github.com/solomontaiwo/ducat.git
cd ducat
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

The app is served at `http://localhost:5173/`. Demo mode works without any backend.

For the shared web development environment, see [the dev setup guide](docs/DEV_ENVIRONMENT.md).

The database schema, row level security policies and helper functions live in `supabase/migrations/`. The publishable key is meant to be public: access to data is enforced by the policies, not by the key.

## Desktop app

Download the installer for your platform; the links always point at the [latest release](https://github.com/solomontaiwo/ducat/releases/latest):

| Platform | Installer |
|---|---|
| macOS Apple Silicon | [`.dmg`](https://ducatapp.com/download/macos) |
| Windows x64 | [`-setup.exe`](https://ducatapp.com/download/windows) |
| Windows ARM64 | [`-setup.exe`](https://ducatapp.com/download/windows-arm64) |

The `ducatapp.com/download/*` links are redirects defined in `public/_redirects` to the fixed-name installers (`Ducat-macos-arm64.dmg`, `Ducat-windows-x64-setup.exe`, `Ducat-windows-arm64-setup.exe`) that the desktop workflow attaches to every release.

Releases no longer include macOS Intel or Linux installers; older packages remain available in their original releases and do not receive updates. How updates work is described in [docs/UPDATER.md](docs/UPDATER.md).

The desktop app checks for updates on launch and from the update icon in the sidebar; it shows the changelog and installs updates only after they are verified with the signing key. The macOS and Windows installers are **not signed or notarized**, so macOS Gatekeeper or Windows SmartScreen may warn or block the first launch. On macOS the bundle is signed ad-hoc, so the first open needs **right-click → Open** (or System Settings → Privacy & Security → Open Anyway); releases up to 4.0.27 were published without that signature and macOS reports them as *damaged*, which is fixed by running `xattr -dr com.apple.quarantine /Applications/Ducat.app` and `codesign --force --deep --sign - /Applications/Ducat.app`.

To build it locally (install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) first, including Rust and the system WebView):

```bash
npm ci
npm run tauri -- dev     # development
npm run tauri -- build   # installers
```

Desktop email confirmation, password reset and email-change links use the deployed web app. After confirming an address, return to the desktop app and sign in; the browser and desktop sessions are separate. To point to a different web deployment, set the optional `VITE_DESKTOP_WEB_URL` build variable to its HTTPS base URL ending in `/`, and configure the matching Supabase Auth redirect allowlist. All `VITE_*` variables are embedded in the app and must not contain secrets.

## iPhone app

The iOS project lives in `ios/` and is generated by Capacitor (Swift Package
Manager, no CocoaPods). The web bundle is built in `mobile` mode, which serves
the app from the container root and enables the native platform layer.

```bash
npm run ios:sync     # build the web bundle, copy it into the Xcode project, align the version
npm run ios:open     # open ios/App/App.xcodeproj in Xcode
```

Xcode 27 (the iOS 27 SDK, needed for the iPhone Duo screens) and an Apple
Developer team are required to run it on a device. TestFlight builds are made
by CI (see below). The simulator build needs no signing:

```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Release -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build CODE_SIGNING_ALLOWED=NO build
```

Differences from the desktop build, all inside `src/platform/`:

| Concern | Web | Desktop (Tauri) | iPhone/iPad (Capacitor) |
|---|---|---|---|
| Save a PDF/CSV/JSON | download | save dialog | share sheet |
| External links | new tab | system browser | in-app browser |
| Session storage | `localStorage` | `localStorage` | native preferences |
| Feedback | none | none | haptics |
| Auth links | same page | public web app | Universal Link into the app |

Offline: the last read of transactions, budgets, recurring rules and
preferences is cached on the device (`src/utils/offlineCache.js`). Without a
connection the app shows that copy with an offline banner. New transactions are
queued on the device (`src/utils/offlineQueue.js`) and sent once the connection
is back; each carries a request id, so a replay never creates duplicates.

Universal Links: the app declares `applinks:<domain>` in
`ios/App/App/App.entitlements`, and `scripts/generate-aasa.mjs` writes
`.well-known/apple-app-site-association` into `dist/` during the build. Set
`APPLE_TEAM_ID` so the file contains the real team prefix.

## App Store releases

Two separate workflows, both started manually from the Actions tab:

- **iOS build** (`.github/workflows/ios.yml`) — builds for the simulator on
  every run; when `upload` is enabled it archives with the App Store
  distribution certificate and profile from the secrets, exports and uploads
  to TestFlight. Upload TestFlight builds only from CI on `main`: a local
  archive would embed the local `.env.mobile.local` settings.
- **Mac App Store** (`.github/workflows/macos-appstore.yml`) — builds the
  universal sandboxed app, signs it with the Mac App Store entitlements and
  produces the `.pkg` for App Store Connect.

The full runbook, the required secrets and the review checklist are in
[docs/APP_STORE_RELEASE.md](docs/APP_STORE_RELEASE.md). The choice of
Capacitor over Tauri mobile is recorded in
[docs/adr/0001-ios-shell.md](docs/adr/0001-ios-shell.md).

## Releases and auto-updates

Every push to `main` bumps the patch version and runs `.github/workflows/desktop.yml`, which builds macOS Apple Silicon and Windows x64/ARM64 packages and publishes a GitHub Release with the installers, the signed update bundles, their `.sig` signatures and a `latest.json` manifest. The updater reads `latest.json` from the latest release, verifies the minisign signature with the public key in `src-tauri/tauri.conf.json` and only then installs the new version. Builds from the default branch and tags are full releases; builds from other branches are prereleases.

Each Windows job verifies the executable architecture and installs the package before uploading it. Signing and macOS notarization require separately configured certificates and credentials. The app still needs Internet access for Supabase account data and synchronization.

## Web deployment

The web app at `ducatapp.com` is built and deployed by Cloudflare Workers
(static assets, `wrangler.jsonc`) from `main`; the build variables live in the
Cloudflare dashboard (see [docs/APP_STORE_RELEASE.md](docs/APP_STORE_RELEASE.md) §8).
The `dev` branch is published to `dev.ducatapp.com` by
`.github/workflows/deploy.yml` after the quality checks (see
[docs/DEV_ENVIRONMENT.md](docs/DEV_ENVIRONMENT.md)).

The iOS and desktop builds read the Supabase settings from these repository
secrets under **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → publishable key |

Optional variable: `VITE_ENABLE_ACCOUNT_DELETION=false` hides account deletion in the profile. It is shown by default, because the App Store requires in-app deletion for any app that lets people create an account.

`VITE_RELEASES_REPO` (default `solomontaiwo/ducat`) points the Updates page at
the GitHub repository that publishes the desktop releases.

## Quality checks

```bash
npm run lint
npm run test:coverage   # unit and component tests
npm run test:db         # schema and row level security, on an in-process PostgreSQL (PGlite)
npm run build && npm run check:bundle
npm run test:e2e
```

`npm run test:all` runs everything in the same order as CI.

## Contributions

Suggestions, bug reports and pull requests are welcome — open an issue or a pull request.

## License

Released under the [MIT License](LICENSE).

## Contact

For questions or suggestions: [taiwo.o.solomon@gmail.com](mailto:taiwo.o.solomon@gmail.com).
