# Rilascio su App Store (iOS + Mac App Store)

Stato: la parte di progetto e di build è nel repository. Quello che resta da
fare richiede credenziali Apple e Xcode su una macchina tua o sul runner CI.

## 1. Prerequisiti

| Cosa | Perché |
|---|---|
| Apple Developer Program (99 €/anno) | firma, TestFlight, App Store |
| Xcode 15+ installato | `xcodebuild`, archivio, TestFlight |
| Licenza Xcode accettata | `sudo xcodebuild -license accept` (una volta sola) |
| Un dominio tuo | bundle id definitivo e URL privacy/supporto |
| Testi privacy e termini veri | obbligatori in App Store Connect |

Il bundle id attuale è **`io.github.solomontaiwo.soldisotto`**. Non è un
dominio tuo e dopo il primo upload non si cambia più. Decidilo prima:

```bash
node scripts/rename-app.mjs --name "Nome Definitivo" --id app.tuodominio
npm run ios:sync
```

Lo script aggiorna Tauri, Capacitor, il progetto Xcode, il manifest PWA, le
traduzioni e il test e2e. La documentazione e i template email di Supabase non
vengono toccati: aggiornali a mano.

## 2. Build locale iOS

```bash
npm run ios:sync        # build web (mode mobile) + cap sync + versione allineata
npm run ios:open        # apre il progetto in Xcode
```

In Xcode: seleziona il team, poi Run su un simulatore o su un iPhone.

Per TestFlight da riga di comando, con la firma configurata:

```bash
IOS_BUILD_NUMBER=42 npm run ios:sync
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath build/App.xcarchive archive
xcodebuild -exportArchive -archivePath build/App.xcarchive \
  -exportOptionsPlist ios/ExportOptions.plist -exportPath build/export
xcrun altool --upload-app --type ios --file build/export/*.ipa \
  --apiKey "$APPLE_API_KEY_ID" --apiIssuer "$APPLE_API_ISSUER_ID"
```

Il workflow `.github/workflows/ios.yml` fa la stessa cosa. Lancia sempre la
build per il simulatore (senza firma) a ogni modifica: è quella che verifica
che il progetto compili.

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
| `APPLE_PROVISIONING_PROFILE` | profilo iOS in base64 |
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
- [ ] Screenshot 6,9" (e 6,5"), icona 1024×1024 **senza canale alpha**
- [ ] App Privacy: email, nome e dati finanziari "collegati all'utente",
      nessun tracking
- [ ] `ITSAppUsesNonExemptEncryption = false` (già in `Info.plist` e in
      `Info.mas.plist`)
- [ ] Categoria Finanza, età 4+, stato *trader* DSA per l'UE
- [ ] Export PDF, CSV e JSON provati **dentro il sandbox** (macOS) e sullo
      share sheet (iOS)

## 6. Rischi di rifiuto e dove sono trattati

| Guideline | Rischio | Stato |
|---|---|---|
| 2.4.5 | updater fuori dallo Store su Mac App Store | gestito con `VITE_APP_STORE` e `createUpdaterArtifacts: false` |
| 5.1.1(v) | eliminazione account | attiva di default, funzione `delete_my_account` |
| 4.2 | app che è "solo un sito" | parzialmente mitigato (share sheet, aptica, safe area, tab bar nativa); per iOS conviene aggiungere la cache offline |
| 4.8 | Sign in with Apple | non richiesto finché c'è solo email/password |
| 3.1.1 | pagamenti in-app | nessun acquisto: non si applica |
| 5.1.2 | dati verso terzi | Supabase è il backend: va dichiarato nella privacy policy |

## 7. Cosa non è ancora coperto

- **Cache offline**: l'app legge da Supabase a ogni avvio. Senza rete mostra
  solo la demo. È il prossimo lavoro consigliato, sia per la 4.2 sia per l'uso
  reale in metro o in aereo.
- **Universal Links**: i link di conferma e reset password aprono il browser.
  Funziona (l'utente conferma e poi accede), ma il flusso ideale riporta
  nell'app. Richiede `apple-app-site-association` sul dominio.
- **iPad**: la build è iPhone-only (`TARGETED_DEVICE_FAMILY = 1`) per ridurre
  il lavoro di layout e screenshot.
- **Widget / App Intents**: richiedono codice Swift in `ios/`.
- **Testi legali**: `src/components/Legal/LegalPage.jsx` contiene ancora i
  segnaposto.
