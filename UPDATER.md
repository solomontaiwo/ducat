# Aggiornamento automatico dell'app desktop (Tauri updater)

L'app desktop usa il plugin [`tauri-plugin-updater`](https://v2.tauri.app/plugin/updater/).
L'aggiornamento **non** avviene installando un nuovo installer a mano: l'app controlla gli
endpoint configurati, scarica l'aggiornamento firmato e si reinstalla, poi chiede il riavvio.

## Come funziona

1. All'avvio (solo desktop) l'app fa un check in background; se trova una versione più nuova
   mostra un prompt («Installa ora / Più tardi»). C'è anche una voce manuale
   **Profilo → Aggiornamenti**.
2. Il client (`src/services/updaterService.js`) chiama `check()` del plugin, che interroga
   `plugins.updater.endpoints` (un file JSON statico su GitHub Releases).
3. Se la risposta contiene una versione > di quella installata, l'app scarica il bundle,
   **verifica la firma minisign** con la chiave pubblica in `tauri.conf.json`, installa e
   propone il riavvio (`relaunch`).

### Endpoint e manifest

- Endpoint: `https://github.com/solomontaiwo/soldi-sotto/releases/latest/download/latest.json`
- `latest.json` è il manifest statico generato da `scripts/build-update-manifest.mjs` durante
  la CI e caricato come asset della release. Contiene per ogni piattaforma `url` + `signature`
  (il contenuto del file `.sig`).

### Piattaforme coperte

| Piattaforma | Bundle updater | Installer manuale |
|---|---|---|
| macOS aarch64 / x86_64 | `.app.tar.gz` (target `app`) | `.dmg` |
| Windows x64 / arm64 | NSIS `-setup.exe` (target `nsis`) | idem |
| Linux x86_64 | `.AppImage` + `.AppImage.sig` (target `appimage`) | idem |

Su Linux l'updater Tauri funziona **solo con l'AppImage**: il processo sostituisce il file
AppImage da cui l'app è in esecuzione. I pacchetti `.deb`, `.rpm` e pacman sono di proprietà
del gestore pacchetti e non possono essere aggiornati dall'app.

Il client rileva il tipo di bundle con `getBundleType()` e:

- con AppImage abilita controllo e installazione automatica;
- con `.deb`, `.rpm` o pacchetto pacman **disabilita l'updater** e nella pagina Aggiornamenti
  spiega di scaricare il nuovo pacchetto dalla release (con pulsante che apre la pagina).

Per questo `latest.json` non deve mai puntare a `.deb`/`.rpm`: la CI costruisce una AppImage
dedicata e `scripts/build-update-manifest.mjs` usa solo l'AppImage (e la sua firma
`.AppImage.sig`) per `linux-x86_64`.

## Firma

Gli aggiornamenti sono firmati con una coppia di chiavi minisign:

- **Chiave pubblica** — in `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`). È pubblica,
  va committata.
- **Chiave privata** — in `~/.tauri/soldi-sotto.key` (NON committata). Senza di essa non è più
  possibile pubblicare aggiornamenti per le installazioni esistenti: va custodita con cura.

`plugins.updater.requireSignedVersion: true` impone che la versione firmata nel `.sig`
corrisponda a quella annunciata dal manifest.

## Passi manuali obbligatori

### 1. Aggiungere il secret CI

Creare il secret GitHub `TAURI_SIGNING_PRIVATE_KEY` con **l'intero contenuto** del file
`~/.tauri/soldi-sotto.key` (il valore base64 su una riga). Esempio:

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY --body "$(cat ~/.tauri/soldi-sotto.key)"
```

> Senza questo secret la build CI fallisce (non può firmare gli aggiornamenti). Il file
> `~/.tauri/soldi-sotto.key` va salvato anche fuori dal repository (password manager o vault).

### 2. Aggiungere un PAT per il bump automatico

Il bump di versione è **automatico**: il workflow `bump-version.yml` incrementa il **patch**
(`4.0.0` → `4.0.1`) a ogni push su `main` e committa `chore(release): <versione>`.

Perché quel commit faccia ripartire la build desktop, serve un **Personal Access Token (PAT)**
con permesso `contents: write` sul repository (GitHub → Settings → Developer settings →
Personal access tokens). Il token `GITHUB_TOKEN` di default **non** fa scattare nuovi workflow.

```bash
gh secret set RELEASE_PAT --body "ghp_..."
```

### 3. Pubblicare un aggiornamento

1. Push su `main`. `bump-version.yml` incrementa la versione; il commit del bump fa partire
   `desktop.yml`, che compila, firma e pubblica la release con `latest.json` e i bundle.
2. Le installazioni con la versione precedente ricevono il prompt al successivo avvio.

Il confronto è **semver** e il bump automatico garantisce una versione crescente, quindi
**ogni push su `main` diventa un aggiornamento** per gli utenti installati. Se in futuro
servisse un controllo più fine (minor/major, o release solo su tag), basta sostituire il bump
patch con una gestione manuale/tag.

## File coinvolti

- `src-tauri/Cargo.toml` — dipendenze `tauri-plugin-updater`, `tauri-plugin-process` e `tauri-plugin-opener`.
- `src-tauri/src/lib.rs` — registrazione dei plugin.
- `src-tauri/capabilities/desktop.json` — permessi `updater:default` e `process:default`.
- `src-tauri/capabilities/default.json` — permesso `opener:default` per aprire le release dal browser.
- `src-tauri/tauri.conf.json` — `bundle.createUpdaterArtifacts`, `plugins.updater` (pubkey,
  endpoint, `requireSignedVersion`), target `app`/`appimage`/`deb`/`rpm`.
- `src/services/updaterService.js` (`canSelfUpdate`, `readBundleType`), `src/hooks/useUpdater.jsx` — logica client.
- `src/components/Update/*` — prompt, progress, voce «Aggiornamenti» e avviso per i pacchetti di sistema.
- `scripts/build-update-manifest.mjs` — genera `latest.json` (Linux solo AppImage).
- `scripts/bump-version.mjs` — incrementa il patch di versione (package.json, lockfile, Cargo.toml).
- `.github/workflows/bump-version.yml` — bump automatico a ogni push su `main`.
- `.github/workflows/desktop.yml` — firma in build, job `linux-appimage`, manifest + bundle.

## Rigenerare le chiavi (solo se necessario)

```bash
npm run tauri signer generate -- -w ~/.tauri/soldi-sotto.key --ci
```

Poi sostituire il `pubkey` in `tauri.conf.json` con il contenuto di
`~/.tauri/soldi-sotto.key.pub` e aggiornare il secret CI. Le installazioni firmate con la
vecchia chiave non accetteranno più gli aggiornamenti firmati con la nuova.
