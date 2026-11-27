# Rilascio su App Store (iOS + Mac App Store)

Stato: la parte di progetto e di build è nel repository. Quello che resta da
fare richiede credenziali Apple e Xcode su una macchina tua o sul runner CI.

## 1. Prerequisiti

| Cosa | Perché |
|---|---|
| Apple Developer Program (99 €/anno) | firma, TestFlight, App Store |
| Xcode 27 (SDK iOS 27) | schermi di iPhone Duo; la CI usa il runner `xcode-27` |
| Licenza Xcode accettata | `sudo xcodebuild -license accept` (una volta sola) |
| Dominio **ducatapp.com** | Universal Links, privacy/supporto, email |
| Hosting con header personalizzati | la AASA deve rispondere `application/json` |
| Testi privacy e termini | già in `src/content/legal.js`, da rileggere |

Il nome è **Ducat**. Il bundle id iOS è **`com.ducatapp.ducat`**, registrato
su Apple Developer; la versione desktop Tauri mantiene **`app.ducat`**. Il
bundle id di una scheda App Store non si può cambiare dopo il primo upload.

## 2. Build locale iOS

La versione iOS è gestita separatamente in `ios/version.json` (inizialmente
`1.0.0`) e viene riportata in Xcode da `scripts/sync-ios-version.mjs`. Le release
web e desktop non la incrementano. Aggiornarla esplicitamente per ogni nuova
versione iOS e usare un numero di build crescente per ogni caricamento.

```bash
npm run ios:sync        # build web (mode mobile) + cap sync + versione allineata
npm run ios:open        # apre il progetto in Xcode
```

In Xcode: seleziona il team, poi Run su un simulatore iPhone o iPad.

Le build per TestFlight si fanno dalla CI: **Actions → iOS build → Run
workflow** su `main`, con `upload` attivo. Il workflow costruisce l'app web in
modalità produzione, firma l'archivio con il certificato Apple Distribution e
il profilo App Store dei segreti (`scripts/ios-release-signing.mjs` passa la
configurazione Release a firma manuale solo in CI) e lo carica su App Store
Connect; il numero di build è il numero dell'esecuzione. Non caricare archivi
fatti in locale: userebbero le impostazioni di `.env.mobile.local` (backend di
sviluppo e badge DEV).

Lancia sempre la build per il simulatore (senza firma) a ogni modifica: è
quella che verifica che il progetto compili.

## 3. Build locale Mac App Store

```bash
export APPLE_SIGNING_IDENTITY="Apple Distribution: Nome (TEAMID)"
export APPLE_INSTALLER_IDENTITY="3rd Party Mac Developer Installer: Nome (TEAMID)"
export APPLE_PROVISIONING_PROFILE="$HOME/Downloads/mas.provisionprofile"
export APPLE_TEAM_ID="TEAMID"
export VITE_APP_STORE=1

node scripts/build-macos-appstore.mjs --check   # verifica l'ambiente
node scripts/build-macos-appstore.mjs           # build + firma + .pkg
```

Il pacchetto finisce in `src-tauri/target/appstore/`. Caricalo con Transporter
o con `altool --upload-app -t macos`.

Cosa cambia rispetto alla build GitHub:

- `src-tauri/tauri.mas.conf.json` attiva il sandbox (`src-tauri/entitlements/AppStore.entitlements`),
  disattiva gli artefatti dell'updater e imposta categoria e copyright;
- build **universal** (Apple Silicon + Intel), una sola per tutto lo Store;
- `VITE_APP_STORE=1` nasconde la pagina Aggiornamenti e ogni chiamata
  all'updater (`src/platform/index.js` → `isStoreBuild`);
- `createUpdaterArtifacts: false`, quindi nessun `.sig` e nessun manifest.

### Portachiavi per l’archivio cifrato su macOS

Lo script Mac App Store aggiunge alla firma l’identificatore applicazione autorizzato dal profilo di provisioning. Il portachiavi Data Protection lo usa per proteggere la chiave locale con Touch ID o con la password di macOS. Per le distribuzioni Developer ID serve un profilo macOS che autorizzi lo stesso identificatore, incluso nel bundle firmato. Le build ad hoc continuano ad aprire l’archivio con passphrase o codice di recupero. [Firma per la distribuzione su macOS](https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac/)

## 4. Segreti GitHub

Settings → Secrets and variables → Actions:

| Secret | Contenuto |
|---|---|
| `APPLE_CERTIFICATE_P12` | certificato "Apple Distribution" in base64 |
| `APPLE_CERTIFICATE_PASSWORD` | password del `.p12` |
| `APPLE_INSTALLER_CERTIFICATE_P12` | certificato installer in base64 |
| `APPLE_INSTALLER_CERTIFICATE_PASSWORD` | password del `.p12` |
| `APPLE_SIGNING_IDENTITY` | `Apple Distribution: … (TEAMID)` |
| `APPLE_INSTALLER_IDENTITY` | `3rd Party Mac Developer Installer: … (TEAMID)` |
| `APPLE_PROVISIONING_PROFILE` | profilo **App Store** iOS in base64, creato per il certificato di `APPLE_CERTIFICATE_P12` |
| `APPLE_MAS_PROVISIONING_PROFILE` | profilo Mac App Store in base64 |
| `APPLE_TEAM_ID` | Team ID |
| `APPLE_API_KEY_ID`, `APPLE_API_ISSUER_ID`, `APPLE_API_KEY_P8` | chiave App Store Connect |

Variabile di repository consigliata: `VITE_DESKTOP_WEB_URL` (URL HTTPS del web
app che termina con `/`), usata nei link delle email.

## 5. Checklist prima dell'invio

- [ ] Bundle id e nome definitivi, app creata in App Store Connect
- [ ] Privacy policy e termini pubblicati su un URL raggiungibile
- [ ] URL di supporto valido
- [ ] "Elimina account" visibile nel profilo e funzionante (ora attivo di
      default: `VITE_ENABLE_ACCOUNT_DELETION` è `true` salvo override)
- [ ] Account di test già verificato nelle note di revisione
- [ ] Screenshot 6,9", 6,5" **e iPad 13"** (iPhone + iPad), icona 1024×1024
      **senza canale alpha**
- [ ] Privacy policy e termini riletti in `src/content/legal.js`: titolare,
      indirizzo e email sono quelli veri
- [ ] `.well-known/apple-app-site-association` raggiungibile in HTTPS e
      servito come `application/json`
- [ ] App Privacy: email, nome e dati finanziari "collegati all'utente",
      nessun tracking
- [ ] `ITSAppUsesNonExemptEncryption = false` (già in `Info.plist` e in
      `Info.mas.plist`)
- [ ] Categoria Finanza, età 4+, stato *trader* DSA per l'UE
- [ ] Export PDF, CSV e JSON provati **dentro il sandbox** (macOS) e sullo
      share sheet (iOS)
- [ ] Prova in modalità aereo: l'app mostra gli ultimi dati e il banner offline

## 6. Rischi di rifiuto e dove sono trattati

| Guideline | Rischio | Stato |
|---|---|---|
| 2.4.5 | updater fuori dallo Store su Mac App Store | gestito con `VITE_APP_STORE` e `createUpdaterArtifacts: false` |
| 5.1.1(v) | eliminazione account | attiva di default, funzione `delete_my_account` |
| 4.2 | app che è "solo un sito" | cache offline, share sheet, aptica, safe area, tab bar nativa |
| 4.8 | Sign in with Apple | non richiesto finché c'è solo email/password |
| 3.1.1 | pagamenti in-app | nessun acquisto: non si applica |
| 5.1.2 | dati verso terzi | Supabase è il backend: dichiarato in privacy policy e App Privacy |

## 7. Stato delle funzioni native

Coperte:

- **Cache offline** (`src/utils/offlineCache.js`): ultimi movimenti, budget,
  ricorrenti e preferenze restano sul dispositivo; senza rete l'app li mostra e
  un banner avvisa che le modifiche richiedono la connessione. La cache si
  svuota quando elimini l'account.
- **Universal Links**: `ios/App/App/App.entitlements` dichiara
  `applinks:ducatapp.com` e `applinks:www.ducatapp.com`;
  `scripts/generate-aasa.mjs` legge il bundle id da `capacitor.config.json` e scrive
  `.well-known/apple-app-site-association` in `dist/` e
  `src/platform/deepLinks.js` apre la rotta giusta nell'app (anche con
  `#access_token` per conferma email e reset password).
- **iPad**: la build è universale iPhone + iPad
  (`TARGETED_DEVICE_FAMILY = "1,2"`), orientamenti gestiti separatamente.
- **Testi legali**: privacy e termini completi in italiano e inglese, con
  titolare e contatti in `src/content/legal.js`.

Non coperte:

- **Widget / App Intents / push**: richiedono codice Swift in `ios/`.
- **Cache delle statistiche**: le pagine Analytics ricaricano dal server; i
  movimenti recenti sì.
- **Rinnovo automatico della sessione in background**: gestito da
  `startAutoRefresh`/`stopAutoRefresh` su `appStateChange`, non da un job nativo.

## 8. Dominio e hosting

Il dominio è **`ducatapp.com`**, registrato su Cloudflare Registrar: i
nameserver sono già quelli Cloudflare, non serve cambiare nulla dal registrar.

| Serve per | Come |
|---|---|
| Universal Links (AASA) | `public/_headers` serve `.well-known` come `application/json` |
| Rotte profonde (`/privacy`, `/reset-password`) | `not_found_handling = single-page-application` in `wrangler.jsonc` |
| URL in App Store Connect | dominio del prodotto |
| Email | `support@ducatapp.com` (Email Routing), invio con Resend sul dominio |

### Cloudflare Workers con static assets

Il progetto si crea da **Workers & Pages → Create → Workers → Connect to Git**:
è il flusso che Cloudflare propone oggi al posto di Pages, e serve gli asset
statici con le stesse regole (`_headers`, dominio custom, TLS).

1. Repository `solomontaiwo/ducat`, branch `main`, nome progetto `ducat`.
2. Comandi:
   - Build: `npm ci && npm run build`
   - Deploy: `npx wrangler deploy`
   - Preview: `npx wrangler versions upload`
3. `wrangler.jsonc` nella root dice a Wrangler cosa pubblicare:
   `assets.directory = ./dist` e
   `not_found_handling = single-page-application`. Così le rotte profonde
   (`/privacy`, `/reset-password`) rispondono 200 e i file veri restano serviti.
   **Non** usare `_redirects` con `/* /index.html 200`: su Workers i redirect
   hanno priorità anche sui file e romperebbero gli asset.
4. Variabili di build (Settings → Build → Variables and secrets), per
   Production e Preview:
   `NODE_VERSION=24`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
   `VITE_DESKTOP_WEB_URL=https://ducatapp.com/`,
   `VITE_ENABLE_ACCOUNT_DELETION=true`, `APPLE_TEAM_ID=<Team ID>`,
   `AASA_REQUIRE_TEAM_ID=1` (o `0` finché non hai il Team ID).
   Senza le due `VITE_SUPABASE_*` il build passa ma l'app mostra un errore.
5. Settings → **Domains & Routes** → Add custom domain: `ducatapp.com` e
   `www.ducatapp.com`. Cloudflare crea record e certificato.
6. Verifica:
   `curl -I https://ducatapp.com/.well-known/apple-app-site-association`
   → `200` con `content-type: application/json`;
   `curl -I https://ducatapp.com/privacy` → `200`.
7. Supabase → Authentication → URL Configuration: Site URL
   `https://ducatapp.com/`; Redirect URLs `https://ducatapp.com/**`,
   `http://localhost:5173/**`.

I redirect di www si gestiscono con una Redirect Rule della zona, non nel repo:
`www.ducatapp.com` → `https://ducatapp.com` 301, con eccezione per
`/.well-known/*` così la AASA resta raggiungibile anche su www.

Il branch `dev` non passa da questa integrazione: lo pubblica GitHub Actions
sul Worker `ducat-dev` (vedi [DEV_ENVIRONMENT.md](DEV_ENVIRONMENT.md)). In
**Settings → Build** del Worker `ducat` conviene disattivare le build dei branch
non di produzione.
