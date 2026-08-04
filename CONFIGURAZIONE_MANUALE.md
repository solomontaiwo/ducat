# Configurazione manuale e runbook di rilascio

> Progetto: Soldi Sotto
> Ultimo aggiornamento: 4 agosto 2026
> Ambito: attività esterne al repository necessarie dopo gli interventi di `AUDIT_COMPLETO.md`

## 1. Scopo e regole operative

Questo documento è la checklist eseguibile per un operatore o un LLM con accesso autorizzato a Firebase, Google Cloud e GitHub. Non contiene segreti e non autorizza modifiche su ambienti remoti.

Regole:

1. usare prima un progetto Firebase di staging;
2. annotare progetto, ambiente, operatore, data e output di ogni comando;
3. non copiare token, password, service account o valori `.env` nei log/issue;
4. fare un export Firestore prima di qualsiasi migrazione con `--apply`;
5. distribuire rules transizionali e indici prima del frontend che scrive schema v2;
6. non attivare enforcement App Check prima che il client con la site key sia online;
7. interrompere il rilascio se un test della sezione 12 fallisce.

## 2. Prerequisiti locali

- Node.js 24 per frontend e Firebase CLI, come indicato da `.nvmrc` e `package.json`;
- Node.js 22 per installare e validare `functions/`, runtime Cloud Functions dichiarato dal progetto;
- npm compatibile con Node 24;
- Java 21 per Firebase Emulator Suite;
- Firebase CLI installata dalle dev dependency del repository;
- Google Cloud CLI soltanto per backup/export e migrazione con Application Default Credentials;
- Chromium Playwright per gli E2E.

Preparazione:

```bash
nvm use
npm ci
nvm exec 22 npm --prefix functions ci
npx playwright install chromium
npm run lint
npm test
npm run test:rules
npm run build
npm run check:bundle
npm run test:e2e
```

Se Java di sistema non è 21, impostare `JAVA_HOME` sul JDK 21 solo per il comando emulator. Non modificare il runtime globale senza autorizzazione.

## 3. Inventario ambienti

Compilare prima del rilascio:

| Campo | Staging | Produzione |
|---|---|---|
| Firebase project ID | TODO | TODO |
| Google Cloud project number | TODO | TODO |
| Dominio frontend | TODO | TODO |
| Regione Functions | `europe-west1` | `europe-west1` |
| Bucket backup Firestore | TODO | TODO |
| App Check site key registrata | sì/no | sì/no |
| Commit/branch rilasciato | TODO | TODO |
| Responsabile e data | TODO | TODO |

## 4. Variabili frontend

Creare `.env` da `.env.example` per lo sviluppo. Il file non deve essere versionato.

Variabili obbligatorie:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_APPCHECK_SITE_KEY`
- `VITE_FIREBASE_APPCHECK_PROVIDER=enterprise` (raccomandato per nuove integrazioni);
- `VITE_FIREBASE_FUNCTIONS_REGION=europe-west1`

Variabili opzionali:

- `VITE_FIREBASE_MEASUREMENT_ID`, solo se Analytics è realmente abilitato;
- `VITE_FIREBASE_APPCHECK_DEBUG=true`, esclusivamente in locale. Al primo avvio la console browser mostra un debug token: registrarlo in Firebase Console e non inserirlo nel repository.

La Firebase web API key è pubblica nel bundle per natura, ma deve essere limitata per referrer e API come descritto nella sezione 8.

## 5. Firebase Authentication

In Firebase Console, per ogni ambiente:

1. abilitare provider Email/Password;
2. impostare una password policy almeno con 8 caratteri; per produzione valutare 12 caratteri e requisiti aggiuntivi compatibili con la UX;
3. attivare email enumeration protection;
4. limitare gli Authorized domains a localhost, dominio staging e dominio produzione realmente usati;
5. configurare mittente, lingua, dominio e URL di continuazione per verifica email e reset password;
6. provare recapito, link scaduto, link già usato e cambio email;
7. valutare MFA solo in base al target di rischio e con un recovery flow documentato.

Non attivare provider non usati. La route applicativa `/verify-email` blocca l’accesso ai dati finché `email_verified` non viene aggiornato.

## 6. Firestore: ordine di deploy

Autenticarsi e selezionare esplicitamente il progetto:

```bash
npx firebase login
npx firebase use PROJECT_ID
npx firebase projects:list
```

Verificare visivamente che il progetto attivo sia quello previsto. Poi:

```bash
npx firebase deploy --only firestore:indexes --project PROJECT_ID
npx firebase deploy --only firestore:rules --project PROJECT_ID
```

Attendere che tutti gli indici risultino `Enabled` prima di distribuire il frontend. Gli indici coprono query per `userId`, `type`, `date`, `dateKey` e ordinamento cronologico.

Le rules sono intenzionalmente transizionali:

- leggono e autorizzano documenti legacy e v2;
- le nuove write producono `amountMinor`, `currency`, `dateKey` e `schemaVersion: 2`;
- l’accesso alle transazioni richiede email verificata e ownership;
- i profili non sono enumerabili e accettano solo campi validati;
- l’email profilo può essere sincronizzata soltanto con quella presente nel token Auth.

## 7. Backup e migrazione transazioni v2

### 7.1 Backup obbligatorio

Creare o scegliere un bucket con retention e accesso limitato. Eseguire un export gestito:

```bash
gcloud firestore export gs://BUCKET/PREFIX-YYYYMMDD-HHMM \
  --project=PROJECT_ID \
  --collection-ids=transactions,users
```

Registrare URI export, conteggio documenti e stato completato. Verificare che il service account Firestore abbia accesso al bucket. Non procedere se l’export è incompleto.

### 7.2 Credenziali trusted

La migrazione usa Firebase Admin e Application Default Credentials. Preferire Workload Identity/Cloud Shell. In locale:

```bash
gcloud auth application-default login
gcloud config set project PROJECT_ID
```

Non scaricare service-account key persistenti se evitabile.

### 7.3 Dry-run

```bash
npm --prefix functions run migrate:transactions -- --project PROJECT_ID
```

Il default è read-only. Conservare il riepilogo JSON `scanned`, `migratable`, `invalid`. Ogni record invalido viene segnalato solo per ID e motivo, senza descrizioni o importi.

Condizioni per proseguire:

- `invalid == 0`, oppure ogni documento invalido è stato analizzato e corretto con una procedura autorizzata;
- il numero `scanned` coincide con il conteggio atteso;
- è disponibile il backup della sezione 7.1.

### 7.4 Apply

```bash
npm --prefix functions run migrate:transactions -- \
  --project PROJECT_ID \
  --apply \
  --confirm-backup
```

Lo script è idempotente: ignora `schemaVersion: 2`, pagina per document ID e scrive batch da massimo 400. Converte `amount` in centesimi con `Math.round(amount * 100)` e preserva il giorno legacy come `dateKey` UTC.

Ripetere il dry-run: `migratable` deve risultare `0`. Confrontare inoltre:

- numero totale documenti prima/dopo;
- somma legacy `amount` e somma `amountMinor / 100` su un campione e sull’intero dataset, accettando solo il rounding documentato;
- estremi di data e conteggi per utente;
- Dashboard, Stats, Analytics, CSV e PDF sullo stesso intervallo.

### 7.5 Rollback

Non cancellare subito i campi legacy `amount` e `date`: lo schema v2 li mantiene appositamente. Se il frontend deve essere ripristinato, ridistribuire il commit precedente e le rules transizionali. Per perdita/corruzione dati usare l’import Firestore dal backup, previa approvazione esplicita e finestra di manutenzione.

## 8. App Check e restrizione API key

### 8.1 Registrazione client

In Firebase Console:

1. registrare l’app web con reCAPTCHA Enterprise, raccomandato da Firebase per nuove integrazioni; usare `recaptcha-v3` solo come fallback consapevole;
2. aggiungere soltanto domini staging e produzione;
3. inserire la site key in `VITE_FIREBASE_APPCHECK_SITE_KEY` e nei GitHub Secrets;
4. distribuire il frontend con App Check inizializzato;
5. verificare metriche e token validi senza enforcement;
6. attivare enforcement prima su staging, poi in produzione per Firestore e Cloud Functions callable;
7. valutare Auth App Check se disponibile/stabile per il progetto e testare tutti i flussi email.

La callable `deleteAccount` impone App Check in produzione. Senza site key configurata il client rifiuta intenzionalmente la cancellazione invece di inviare una richiesta non attestata.

### 8.2 Debug locale

Con `VITE_FIREBASE_APPCHECK_DEBUG=true`, copiare il debug token stampato dal client e registrarlo nella sezione App Check della Console. Non usare token di debug su domini pubblici e revocarli quando non servono.

### 8.3 API key

In Google Cloud Console → Credentials:

- applicare HTTP referrer restriction ai soli origin necessari, includendo il path GitHub Pages se richiesto dalla configurazione;
- limitare la key alle API Firebase effettivamente usate (Identity Toolkit, Token Service, Firestore e servizi richiesti dal Web SDK);
- mantenere key separate per staging e produzione;
- verificare login, refresh token, Firestore e App Check dopo la restrizione.

## 9. Cloud Function di cancellazione account

La Function Gen 2 `deleteAccount` usa Node 22, opera in `europe-west1`, richiede autenticazione recente e App Check, cancella a batch tutte le transazioni dell’UID, il profilo e infine l’utente Auth.

Deploy:

```bash
nvm exec 22 npm --prefix functions ci
npx firebase deploy --only functions:deleteAccount --project PROJECT_ID
```

Verifiche IAM/runtime:

- runtime Node supportato dalla piattaforma e coerente con `functions/package.json`;
- service account con soli permessi necessari su Auth e Firestore;
- nessun invoker pubblico diverso dal meccanismo callable previsto;
- log senza payload finanziari;
- alert su error rate e invocazioni anomale.

Test staging obbligatorio con un account sacrificabile contenente più di 400 transazioni:

1. export JSON dal Profilo;
2. inserimento password e conferma cancellazione;
3. transazioni assenti, profilo assente e utente Auth assente;
4. nuova richiesta non produce dati orfani;
5. token mancante, App Check mancante e login vecchio sono rifiutati;
6. un fallimento intermedio può essere ritentato in modo sicuro.

## 10. GitHub Actions e repository

In Settings → Secrets and variables → Actions aggiungere:

- tutti i `VITE_FIREBASE_*` obbligatori della sezione 4;
- `VITE_FIREBASE_APPCHECK_SITE_KEY`.

In Settings → Pages scegliere `GitHub Actions` come source. Applicare branch protection su `main` richiedendo il job `quality`. Il workflow esegue lint, unit/component test, rules emulator, audit runtime, build, budget bundle ed E2E desktop/mobile prima del deploy.

Dependabot è configurato per npm e GitHub Actions. Abilitare dependency graph, Dependabot alerts e secret scanning. Revisionare gli aggiornamenti: non fare merge automatico di major update senza test.

Le GitHub Actions sono pin-nate a commit SHA; Dependabot deve aggiornare sia SHA sia commento versione.

## 11. Hosting e header di sicurezza

La CSP in `index.html` elimina script inline e font remoti ed è un hardening client-side. Una meta CSP non può applicare correttamente `frame-ancestors` e non sostituisce gli header HTTP.

GitHub Pages non offre una configurazione completa degli header. Per produzione è raccomandata una migrazione a Firebase Hosting, Cloudflare Pages o altro CDN configurabile. Impostare:

```text
Content-Security-Policy: default-src 'self'; script-src 'self' https://apis.google.com https://www.gstatic.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebaseapp.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com; frame-src 'self' https://*.firebaseapp.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
Cross-Origin-Opener-Policy: same-origin-allow-popups
```

Prima dell’enforcement usare `Content-Security-Policy-Report-Only` sul CDN, raccogliere violazioni e provare login, verifica email, Firestore, App Check, export e Function. Google Auth popup richiederebbe una revisione specifica della COOP; il provider attuale è Email/Password.

Cache consigliata:

- HTML/404/manifest: `no-cache` o TTL breve;
- `/assets/*` hashati: `public,max-age=31536000,immutable`;
- icone versionate: TTL lungo con invalidazione al cambio nome.

## 12. Validazione release

### Automatica

```bash
npm run lint
npm test
npm run test:rules
npm audit --omit=dev --audit-level=high
npm --prefix functions audit --omit=dev --audit-level=high
npm run build
npm run check:bundle
npm run test:e2e
```

`npm audit` richiede accesso al registry. Distinguere un errore DNS/sandbox da una vulnerabilità rilevata.

### Smoke test manuale

- landing, Privacy e Termini accessibili senza login;
- registrazione → verifica email → refresh token → Dashboard;
- login errato senza enumerazione dell’account;
- reset password e cambio email con ri-autenticazione;
- CRUD transazione, doppio submit senza duplicati, delete fallita senza sparizione ottimistica;
- 1.000 transazioni: prima pagina massimo 40, scroll senza duplicati, ricerca dichiaratamente sulle pagine caricate;
- stessi totali su Dashboard/Stats/Analytics per lo stesso range;
- date Europe/Rome e America/Los_Angeles, inclusi cambi DST;
- CSV con virgole, newline e valori `=`, `+`, `-`, `@`; PDF senza mutare l’ordine UI;
- export JSON account completo;
- logout e cambio account senza cronologia finanziaria in `localStorage`;
- navigazione tastiera, zoom 200%, screen reader e axe senza violazioni serious/critical;
- modalità demo, limite e reset dati;
- deep link e reload su ogni route.

## 13. Monitoring, budget e privacy

Configurare:

- Firebase/Google Cloud alert per Auth errors, Function error rate/latency, Firestore denied requests, reads/writes e quota;
- budget mensile e soglie 50/80/100%;
- retention dei log minima necessaria e nessun dato finanziario nei log;
- uptime check su landing e smoke autenticato sintetico separato;
- Core Web Vitals real-user monitoring solo dopo consenso/privacy review;
- procedura incident response con referente, severità, revoca credenziali, rollback e notifica utenti.

Prima del rilascio pubblico sostituire i placeholder nelle pagine Privacy/Termini con testo approvato che specifichi titolare, contatti, base giuridica, retention, subprocessors, trasferimenti, diritti e canale richieste. Il testo incluso nel repository è deliberatamente una base tecnica, non consulenza legale.

## 14. Checklist di completamento

- [ ] test automatici verdi su Node 24/Java 21;
- [ ] backup Firestore completato e ripristinabile;
- [ ] indici `Enabled` e rules transizionali deployate;
- [ ] migrazione dry-run senza invalidi;
- [ ] migrazione apply verificata e riconciliata;
- [ ] Function `deleteAccount` deployata e testata;
- [ ] Auth/password/email/domain configurati;
- [ ] App Check client distribuito, metriche sane, enforcement attivo;
- [ ] API key ristretta e flussi smoke verdi;
- [ ] GitHub Secrets/branch protection/Pages configurati;
- [ ] header HTTP applicati o rischio GitHub Pages formalmente accettato;
- [ ] Privacy/Termini completati dal responsabile;
- [ ] alert, budget, log retention e runbook incidenti configurati;
- [ ] commit e versione rilasciata registrati nell’inventario.
