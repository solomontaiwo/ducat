# SoldiSotto

SoldiSotto is a web application developed in React, designed to manage personal finances. This project was created with the aim of exploring and learning the features of the React framework, with Supabase (PostgreSQL, Auth and Realtime) as the backend.

## Features

- **Registration and Login**: Users can create an account or log in with existing credentials.
- **Add Transactions**: Easily and quickly record your income and expenses.
- **Chronological View**: View all your transactions in chronological order.
- **Statistics**: View financial statistics by day, week, month, or year.
- **PDF Generation**: Generate a PDF containing all transactions for a selected period (day, week, month, year) along with relevant statistics.

## Technologies Used

- **React**: JavaScript framework used to build the user interface.
- **Supabase**: authentication, PostgreSQL database protected by row level security, Realtime sync between devices.

## Getting Started

Requirements: Node.js 24 and a Supabase project (see [SUPABASE.md](SUPABASE.md) for the full setup and the move from Firebase).

```bash
git clone https://github.com/solomontaiwo/soldi-sotto.git
cd soldi-sotto
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

The app is served at `http://localhost:5173/soldi-sotto/`. Demo mode works without any backend.

The database schema, row level security policies and helper functions live in `supabase/migrations/`. The publishable key is meant to be public: access to data is enforced by the policies, not by the key.

## Deployment on GitHub Pages

Every push to `main` builds and publishes the app through `.github/workflows/deploy.yml`. Add these repository secrets under **Settings → Secrets and variables → Actions**:

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

Since this is one of my first projects in React, any suggestions or contributions are welcome! If you'd like to contribute, feel free to open a pull request or report any issues via the issues tab.

## Contact

For questions or suggestions, you can contact me via email: [solomon.taiwo@studenti.polito.it](mailto:solomon.taiwo@studenti.polito.it).

---

## Desktop application

The same React frontend can also be packaged with Tauri 2 for macOS, Windows and Linux. Install the platform prerequisites, including Rust and the system WebView, from the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). Configure the public Supabase values described above before building.

```bash
npm ci
npm run tauri -- dev
npm run tauri -- build
```

Desktop email confirmation, password reset and email-change links use the deployed web application. After confirming an address, return to the desktop app and sign in; the browser and desktop sessions are separate. For a different web deployment, set the optional `VITE_DESKTOP_WEB_URL` build variable to its HTTPS base URL ending in `/`, and configure the matching Supabase Auth redirect allowlist. This value and all `VITE_*` variables are included in the app and must not contain secrets.

The `Desktop builds` GitHub Actions workflow runs on every push, including tag pushes, and on manual dispatch. It builds macOS Apple Silicon and Intel DMGs, Windows x64 and ARM64 NSIS installers, and Linux x64 `.deb`, `.rpm` and Arch `.pkg.tar.zst` packages. Download the artifacts from the workflow run; they are retained for 30 days. The build requires the repository secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; optional repository variables are `VITE_ENABLE_ACCOUNT_DELETION` and `VITE_DESKTOP_WEB_URL`. Runner availability and minutes depend on the repository's GitHub plan, especially for Windows ARM.

The Ubuntu package is built in an Ubuntu 22.04 container on a supported Ubuntu 24.04 GitHub runner, so it does not depend on the retiring Ubuntu 22.04 runner image while retaining the older build environment.

For Windows ARM64, the installed application is built for ARM64; the NSIS installer itself runs through Windows x86 emulation. Each Windows job checks the executable architecture and installs its package silently before uploading it.

These CI packages are not signed or notarized. macOS Gatekeeper and Windows SmartScreen can therefore warn or block installation. Signing and macOS notarization require separately configured certificates and credentials. The packages do not update automatically. Linux packages and WebView behavior must be verified on the target distribution; the Arch package is a downloadable pacman package, not an AUR publication. The app still requires Internet access for Supabase account data and synchronization.

For local installation of the matching Linux x86_64 artifact, use the system package manager:

```bash
sudo apt install ./soldi-sotto.deb        # Ubuntu; substitute the downloaded filename
sudo dnf install ./soldi-sotto.rpm         # Fedora; substitute the downloaded filename
sudo pacman -U ./soldi-sotto.pkg.tar.zst  # Arch; substitute the downloaded filename
```

On Arch the workflow compiles against Arch libraries and creates the pacman package with `packaging/arch/PKGBUILD`; on Fedora it compiles against Fedora libraries. Package availability on other distributions or older releases is not guaranteed. Use an account and data intended for testing when checking email flows, synchronization or backup restoration.
