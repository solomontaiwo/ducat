# SoldiSotto

SoldiSotto is a personal finance app for the **web and desktop** (macOS, Windows, Linux). It is built with React and Vite, packaged as a desktop app with Tauri 2, and uses Supabase (PostgreSQL, Auth and Realtime) as the backend.

## Features

- **Accounts and login** — email/password accounts with password reset and email change, plus a local demo mode that needs no backend.
- **Income and expenses** — add, edit and delete transactions with categories, search and a chronological view.
- **Budgets and recurring expenses** — monthly limits per category and recurring rules.
- **Analytics and insights** — KPI tiles, monthly income/expense trend, spending by category and comparisons with the previous period.
- **Backups and exports** — JSON backup/restore plus CSV and PDF reports.
- **Desktop auto-updates** — on macOS, Windows and the Linux AppImage the app checks for updates, shows the changelog and installs signed updates; `.deb`, `.rpm` and pacman packages are updated by the package manager.
- **Cross-platform** — macOS (Apple Silicon and Intel), Windows (x64 and ARM64), and Linux AppImage, `.deb`, `.rpm` and Arch packages.
- **Themes and languages** — light/dark/system theme and Italian/English.

## Technologies

- **React + Vite** — user interface.
- **Tauri 2 (Rust)** — desktop shell, installers and signed auto-updates.
- **Supabase** — Auth, PostgreSQL protected by row level security, Realtime sync between devices.

## Getting started (web)

Requirements: Node.js 24 and a Supabase project (see [SUPABASE.md](SUPABASE.md) for the full setup).

```bash
git clone https://github.com/solomontaiwo/soldi-sotto.git
cd soldi-sotto
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

The app is served at `http://localhost:5173/soldi-sotto/`. Demo mode works without any backend.

The database schema, row level security policies and helper functions live in `supabase/migrations/`. The publishable key is meant to be public: access to data is enforced by the policies, not by the key.

## Desktop app

Download the installer for your platform from the [latest release](https://github.com/solomontaiwo/soldi-sotto/releases/latest):

| Platform | Installer |
|---|---|
| macOS Apple Silicon / Intel | `.dmg` |
| Windows x64 / ARM64 | `-setup.exe` |
| Linux x64 (any distro) | `.AppImage` |
| Ubuntu x64 | `.deb` |
| Fedora x64 | `.rpm` |
| Arch Linux x64 | `.pkg.tar.zst` |

On Linux, install the matching artifact with the system package manager:

```bash
chmod +x ./Soldi-Sotto-*.AppImage && ./Soldi-Sotto-*.AppImage   # AppImage, no install needed
sudo apt install ./soldi-sotto.deb        # Ubuntu; substitute the downloaded filename
sudo dnf install ./soldi-sotto.rpm        # Fedora; substitute the downloaded filename
sudo pacman -U ./soldi-sotto.pkg.tar.zst  # Arch; substitute the downloaded filename
```

The desktop app checks for updates on launch and from the update icon in the sidebar; it shows the changelog and installs updates only after they are verified with the signing key. On Linux only the **AppImage** can update itself: `.deb`, `.rpm` and pacman installs show a notice and must be updated with the package manager (or by downloading the new package). The macOS and Windows installers are **not signed or notarized**, so macOS Gatekeeper or Windows SmartScreen may warn or block the first launch.

To build it locally (install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) first, including Rust and the system WebView):

```bash
npm ci
npm run tauri -- dev     # development
npm run tauri -- build   # installers
```

Desktop email confirmation, password reset and email-change links use the deployed web app. After confirming an address, return to the desktop app and sign in; the browser and desktop sessions are separate. To point to a different web deployment, set the optional `VITE_DESKTOP_WEB_URL` build variable to its HTTPS base URL ending in `/`, and configure the matching Supabase Auth redirect allowlist. All `VITE_*` variables are embedded in the app and must not contain secrets.

## Releases and auto-updates

Every push to `main` bumps the patch version and runs `.github/workflows/desktop.yml`, which builds every desktop package and publishes a GitHub Release with the installers, the signed update bundles, their `.sig` signatures and a `latest.json` manifest. The updater reads `latest.json` from the latest release, verifies the minisign signature with the public key in `src-tauri/tauri.conf.json` and only then installs the new version. Builds from the default branch and tags are full releases; builds from other branches are prereleases.

The Ubuntu package is built in an Ubuntu 22.04 container on an Ubuntu 24.04 runner; the AppImage is built on Ubuntu 22.04 so it runs on older glibc. Windows ARM64 installers run through x86 emulation, and each Windows job verifies the executable architecture and installs the package before uploading it. Signing and macOS notarization require separately configured certificates and credentials. Linux packages and WebView behavior must be verified on the target distribution; the Arch package is a downloadable pacman package, not an AUR publication. The app still needs Internet access for Supabase account data and synchronization.

## Deployment on GitHub Pages

Every push to `main` builds and publishes the web app through `.github/workflows/deploy.yml`. Add these repository secrets under **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → publishable key |

Optional repository variable: `VITE_ENABLE_ACCOUNT_DELETION=true` shows account deletion in the profile.

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

For questions or suggestions: [solomon.taiwo@studenti.polito.it](mailto:solomon.taiwo@studenti.polito.it).
