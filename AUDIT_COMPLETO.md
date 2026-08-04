# Audit completo di SoldiSotto

> Documento operativo per implementazione e test assistiti da LLM
> Data audit: 4 agosto 2026
> Repository analizzato: `soldi-sotto` v4.0.0
> Commit osservato: `82f25fb7`
> Ambito: sicurezza, correttezza funzionale, affidabilità, prestazioni, accessibilità, qualità, CI/CD e possibili evoluzioni

> **Nota di implementazione:** questo documento conserva le evidenze del baseline pre-intervento. Lo stato delle correzioni applicate nel branch `feature/audit-intervention`, le verifiche e i rischi residui sono tracciati in `STATO_IMPLEMENTAZIONE_AUDIT.md`; le attività remote/manuali sono in `CONFIGURAZIONE_MANUALE.md`.

## 1. Come usare questo documento

Questo file è sia un audit sia un backlog tecnico. Un agente che implementa le modifiche deve:

1. lavorare per fasi, nell'ordine indicato nella sezione 12;
2. creare una modifica piccola e verificabile per ogni finding o gruppo strettamente correlato;
3. preservare i dati Firestore esistenti e i flussi demo;
4. non cambiare contemporaneamente schema dati, query e interfaccia senza una strategia di compatibilità;
5. aggiungere i test indicati prima di considerare risolto un finding;
6. non modificare credenziali, `.env` o configurazioni Firebase remote senza autorizzazione esplicita;
7. distinguere sempre tra modifiche al repository e attività manuali nella Firebase Console o nell'hosting.

Le priorità usate sono:

- **P0**: compromissione o perdita dati già dimostrata; nessun finding P0 è stato rilevato staticamente.
- **P1**: correggere prima della prossima release; rischio concreto per sicurezza, dati o risultato funzionale.
- **P2**: pianificare subito dopo i P1; impatto rilevante su affidabilità, costi, prestazioni o UX.
- **P3**: hardening, manutenibilità o evoluzione di prodotto.

## 2. Executive summary

SoldiSotto ha una base semplice e comprensibile: SPA React/Vite, Firebase Authentication, Firestore chiamato direttamente dal browser, modalità demo in `localStorage`, viste statistiche ed export CSV/PDF. Le regole Firestore applicano ownership e verifica email sulle transazioni; il repository non contiene credenziali Firebase reali nel tree corrente; lint, build e test esistenti passano.

L'applicativo non è però ancora pronto per una crescita significativa dei dati o per un uso ad alta affidabilità. Le criticità principali sono:

1. **dipendenze runtime vulnerabili note**: `react-router-dom@6.30.4`/`react-router@6.30.4` risultano vulnerabili nell'audit npm del 4 agosto 2026;
2. **statistiche incoerenti**: la pagina `Stats` usa soltanto lo stream degli ultimi 50 documenti, mentre Dashboard e Analytics usano dataset differenti;
3. **paginazione non reale**: l'“infinite scroll” scarica l'intera cronologia con una query senza `limit`, aumentando letture Firestore, memoria e latenza;
4. **workflow email verification incompleto**: le regole negano tutte le transazioni agli utenti non verificati, ma l'app li porta comunque in Dashboard senza un percorso affidabile di verifica e refresh del token;
5. **importi memorizzati come floating point**: somme e percentuali finanziarie possono accumulare errori di precisione;
6. **copertura test insufficiente**: esistono solo due test sul nome file; autenticazione, regole Firestore, CRUD, statistiche, export e routing non sono coperti;
7. **gestione errori e concorrenza debole**: diverse query asincrone non hanno `catch`, stato d'errore o protezione da risposte fuori ordine;
8. **dati finanziari persistiti in chiaro in `localStorage`** e cache che, per impostazione predefinita, effettua comunque una richiesta di rete a ogni lettura;
9. **bundle iniziale e preload aggressivi**: il codice analitico pesa circa 428 kB raw/122 kB gzip e viene precaricato in idle per ogni utente autenticato; Firebase Auth e Firestore sono accoppiati anche sulla landing pubblica;
10. **hardening web incompleto**: il sito live serve HSTS, ma non CSP, anti-framing, `X-Content-Type-Options`, `Referrer-Policy` o `Permissions-Policy`.

Valutazione qualitativa attuale:

| Area | Stato | Nota sintetica |
|---|---|---|
| Sicurezza dati Firestore | Discreta base, incompleta | Ownership presente; validazione profilo, test regole e lifecycle account da rafforzare |
| Sicurezza supply chain/web | Da intervenire | Vulnerabilità npm runtime e header di hardening mancanti |
| Correttezza funzionale | Da intervenire | Dataset diversi tra viste, verifica email e registrazione parziale |
| Prestazioni/costi | Da intervenire | Full-history fetch, cache inefficace, preload e bundle pesanti |
| Affidabilità | Bassa-moderata | Error handling, race cancellation, monitoring e test carenti |
| Accessibilità/i18n | Incompleta | Zoom disabilitato, controlli non sempre accessibili, lingua documento statica |
| Manutenibilità | Moderata | Struttura chiara, ma codice legacy/dead code e logiche duplicate |

## 3. Architettura e flussi osservati

### 3.1 Stack

- React 18.3.1 e React DOM 18.3.1.
- Vite 7.3.6 installato dal lockfile.
- React Router DOM 6.30.4.
- Firebase 11.10.0 per Auth e Firestore.
- Firestore come backend serverless, accesso diretto dal browser.
- `date-fns` per date e statistiche; `dayjs` è installato ma non risulta usato dall'app.
- Recharts per analytics.
- jsPDF e jsPDF-AutoTable per export PDF.
- GitHub Pages per hosting statico.

### 3.2 Flusso dati autenticato

1. `AuthProvider` carica dinamicamente Firebase e si iscrive a `onAuthStateChanged`.
2. `UnifiedTransactionProvider` sceglie Firebase, demo o contesto neutro.
3. `TransactionProvider` apre uno snapshot realtime limitato a 50 transazioni ordinate per `createdAt`.
4. Dashboard esegue query per intervallo su `date`.
5. Analytics scarica tutta la cronologia.
6. Stats usa solo le 50 transazioni del provider realtime.
7. Create, update e delete sono eseguite direttamente dal client e autorizzate dalle regole Firestore.

### 3.3 Flusso demo

- Flag e transazioni demo sono persistiti in `localStorage`.
- Il limite dichiarato è 10 transazioni create dall'utente; i sample non contano nel limite.
- Non c'è sincronizzazione cloud, cifratura o isolamento multi-profilo per la demo.

### 3.4 Confini di sicurezza

- Il frontend non è un confine di sicurezza: i controlli reali sono le regole Firestore e Firebase Auth.
- Le transazioni richiedono utente autenticato, email verificata e `userId` proprietario.
- I profili richiedono autenticazione e UID corrispondente, ma la validazione dei campi è incompleta.
- Non è presente un backend trusted per migrazioni, aggregazioni, cancellazioni a cascata o rate limiting applicativo.

## 4. Aspetti positivi da preservare

- `firestore.rules:30-37` applica ownership a read/write e impedisce il cambio di `userId` e `createdAt` in update.
- `firestore.rules:17-27` usa `hasOnly`/`hasAll` e vincoli di tipo/dimensione sulle transazioni.
- Le query client includono il filtro `userId`, coerente con il modello di autorizzazione delle rules.
- Non sono presenti `dangerouslySetInnerHTML`, `eval` o rendering HTML non sanificato nel codice applicativo.
- `.env` è ignorato e `.env.example` contiene soltanto placeholder; la scansione del tree corrente non ha trovato chiavi Firebase reali o private key.
- Gli export PDF sono caricati dinamicamente e non gonfiano il primo caricamento della landing.
- Le route principali sono lazy-loaded e gli asset Vite hanno nomi hashati.
- La build di produzione non genera source map pubbliche.
- Il workflow GitHub usa permessi espliciti e ridotti per il deploy Pages.
- Sono già documentati App Check, password policy e restrizione della API key, anche se non verificabili dal repository.

## 5. Findings di sicurezza

### SEC-01 — Aggiornare le dipendenze con vulnerabilità note

**Priorità:** P1
**Evidenza:** `package.json:35`, `package-lock.json`; `npm audit` del 4 agosto 2026.

Risultati audit:

- runtime: 2 vulnerabilità moderate in `react-router`/`react-router-dom@6.30.4`, inclusa una catena open redirect → XSS;
- toolchain: `postcss@8.5.19` ha una vulnerabilità moderate di path disclosure nella gestione source map;
- toolchain transitiva: `brace-expansion@1.1.16` ha due advisory high di denial of service;
- totale audit completo: 1 high, 3 moderate, 0 critical;
- totale `--omit=dev`: 2 moderate, entrambe nella famiglia React Router.

Advisory osservati:

- <https://github.com/advisories/GHSA-jjmj-jmhj-qwj2>
- <https://github.com/advisories/GHSA-wrjc-x8rr-h8h6>
- <https://github.com/advisories/GHSA-337j-9hxr-rhxg>
- <https://github.com/advisories/GHSA-fxqj-rqcc-2cmp>
- <https://github.com/advisories/GHSA-mh99-v99m-4gvg>
- <https://github.com/advisories/GHSA-rgw5-rvv9-x895>

**Modifica richiesta:**

1. eseguire `npm audit fix --dry-run` e verificare le versioni proposte;
2. aggiornare React Router a una versione non vulnerabile; se richiede major upgrade, seguire la migration guide e coprire tutte le route con test;
3. aggiornare PostCSS e la catena ESLint/minimatch/brace-expansion senza usare `--force` alla cieca;
4. rigenerare e revisionare `package-lock.json`;
5. rieseguire lint, test, build e smoke E2E.

**Criteri di accettazione:**

- `npm audit --omit=dev` non segnala vulnerabilità high/critical né gli advisory React Router sopra elencati;
- eventuali vulnerabilità residue della toolchain sono documentate con rischio e scadenza;
- deep link, redirect, login/logout e wildcard route continuano a funzionare.

### SEC-02 — Allineare verifica email, routing e refresh del token

**Priorità:** P1
**Evidenza:** `firestore.rules:9-15`, `firestore.rules:30-37`, `src/components/Auth/Register.jsx:66-73`, `src/components/Layout/AppLayout.jsx:122-164`.

Le rules richiedono `email_verified == true` per ogni operazione sulle transazioni. La registrazione, però, ignora il fallimento dell'invio email e naviga comunque a Dashboard. Il banner consente solo il reinvio; non esiste una pagina di verifica, un polling controllato, `user.reload()` o un forced token refresh. Dopo aver verificato l'email in un'altra scheda, il claim nel token può restare vecchio e Firestore continuare a negare l'accesso.

**Modifica richiesta:**

- introdurre una route `/verify-email` dedicata;
- dopo registrazione portare sempre l'utente non verificato a quella route;
- offrire reinvio con cooldown, messaggio di successo/errore e pulsante “Ho verificato” che esegue `currentUser.reload()` e `getIdToken(true)`;
- impedire l'apertura delle viste dati/FAB finché il claim non è aggiornato;
- mantenere accessibili logout e, se desiderato, impostazioni minime del profilo;
- mappare `permission-denied` a un errore utile invece di lasciare viste vuote.

**Test richiesti:** utente verificato, non verificato, invio email fallito, link verificato in altra scheda, token stale, offline, reload diretto di `/verify-email`.

### SEC-03 — Rafforzare e testare le regole del profilo utente

**Priorità:** P1
**Evidenza:** `firestore.rules:40-50`.

In create sono validati soltanto equality dell'email e tipo/lunghezza di `displayName`; `username`, `email`, `createdAt` e `updatedAt` non hanno tutti i vincoli di tipo e timestamp. In update `username` e `updatedAt` possono assumere tipi o dimensioni arbitrarie. Non esistono test automatici delle rules.

**Modifica richiesta:**

- creare funzioni `isValidProfileCreate` e `isValidProfileUpdate`;
- imporre stringhe trim-compatible e lunghezza 3–50 a `username` e `displayName`;
- imporre email stringa uguale al token e immutabile;
- usare `request.time`/server timestamp per `createdAt` e `updatedAt`, con `createdAt` immutabile;
- decidere esplicitamente se `username == displayName` è un'invariante;
- aggiungere Firebase Emulator Suite e test `@firebase/rules-unit-testing` per owner/non-owner, verified/unverified, campi extra, tipi errati e mutazioni vietate.

**Criterio di accettazione:** ogni `allow` e ogni ramo di rifiuto rilevante ha almeno un test positivo e uno negativo.

### SEC-04 — Ridurre la persistenza di dati finanziari in `localStorage`

**Priorità:** P1
**Evidenza:** `src/services/transactionService.jsx:20-43`, `src/services/transactionService.jsx:82-155`, `src/services/transactionService.jsx:172-233`.

Intere cronologie finanziarie e conteggi sono serializzati in chiaro e rimangono leggibili da qualsiasi JavaScript eseguito sulla stessa origin. Le chiavi sono separate per UID, ma il dato persiste oltre la sessione. Il logout prova a cancellare la cache solo dopo `signOut`; se il dynamic import fallisce, la cache può rimanere.

**Modifica richiesta:**

- preferire cache in memoria per i dati completi;
- se serve offline, usare la persistenza Firestore/IndexedDB con una decisione di prodotto esplicita e purge al logout;
- cancellare la cache in un `finally` prima o indipendentemente dal completamento del logout;
- introdurre versione/schema, quota handling e TTL centralizzati;
- non presentare cifratura client-side con chiave nello stesso bundle come protezione da XSS: non lo è.

**Test richiesti:** logout online/offline, errore nell'import del service, cambio account sullo stesso browser, cache corrotta, quota storage esaurita.

### SEC-05 — Aggiungere header di sicurezza e una CSP applicabile

**Priorità:** P2
**Evidenza runtime:** risposta live `https://solomontaiwo.github.io/soldi-sotto/` verificata il 4 agosto 2026.

Il sito live serve HSTS, ma non risultano `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` o una protezione anti-framing. GitHub Pages non consente una configurazione completa di header custom. Sono inoltre presenti script inline e Google Fonts, che rendono più complessa una CSP restrittiva.

**Modifica richiesta:**

- scelta preferita: pubblicare dietro un hosting/CDN che consenta header custom;
- impostare almeno CSP con allowlist minima per self, Firebase/Google Auth realmente necessari e font self-hosted; `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`;
- aggiungere `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` e una `Permissions-Policy` che disabiliti feature non usate;
- rimuovere o hashare gli script inline prima di irrigidire `script-src`;
- validare login, Firestore e verifica email con la CSP in report-only prima dell'enforcement.

**Nota:** una CSP via `<meta>` può essere un hardening parziale, ma non sostituisce `frame-ancestors` via header.

### SEC-06 — Neutralizzare CSV formula injection

**Priorità:** P2
**Evidenza:** `src/components/Analytics/TransactionAnalytics.jsx:190-213`.

La descrizione è correttamente quotata per CSV, ma un valore che inizia con `=`, `+`, `-`, `@`, tab o carriage return può essere interpretato come formula da Excel/LibreOffice. Il dato è normalmente inserito dallo stesso utente, ma può diventare pericoloso se file o account sono condivisi o se in futuro si aggiunge import/sync esterno.

**Modifica richiesta:** creare un serializer CSV unico che:

- esegua escaping RFC 4180 di ogni cella;
- anteponga un apostrofo o altra neutralizzazione documentata alle celle formula-like;
- produca UTF-8 con BOM se si vuole compatibilità Excel;
- scelga separatore coerente o offra un formato locale senza rompere parsing standard.

**Test richiesti:** descrizioni con virgole, quote, newline, `=HYPERLINK(...)`, `+cmd`, `-1+2`, `@SUM`, Unicode e stringhe vuote.

### SEC-07 — Verificare controlli Firebase non osservabili dal codice

**Priorità:** P1 manuale
**Evidenza:** `README.md:104-120`; configurazione remota non disponibile durante l'audit.

Verificare nella console, senza assumere che la documentazione equivalga a configurazione applicata:

- App Check registrato ed enforced per Firestore e, dove supportato, Auth;
- password policy robusta e protezione anti-abuso;
- email enumeration protection;
- authorized domains limitati;
- restrizioni HTTP referrer della API key sui soli domini necessari;
- template e dominio mittente delle email;
- alert su picchi di Auth, document reads/writes e denial delle rules;
- rules e indexes effettivamente deployati nella stessa versione del repository;
- budget/quote alert Firebase e Google Cloud.

Registrare data, progetto, ambiente e screenshot/esito in un runbook, senza salvare segreti nel repository.

### SEC-08 — Introdurre lifecycle sicuro per account e dati

**Priorità:** P2
**Evidenza:** `firestore.rules:50`; nessun flusso applicativo di cancellazione account.

La rule permette di cancellare il documento profilo, ma non esiste un flusso che cancelli Auth e tutte le transazioni. Una cancellazione parziale lascerebbe dati finanziari orfani. Mancano inoltre retention policy, privacy notice e procedura di export/cancellazione.

**Modifica richiesta:**

- aggiungere export completo prima della cancellazione;
- richiedere re-authentication;
- usare una Cloud Function/backend trusted per cancellazione batch di transazioni, profilo e account Auth, idempotente e osservabile;
- definire policy di retention e recovery/backup;
- aggiungere privacy policy e informativa sull'uso di Firebase/Google Fonts o self-hostare i font.

## 6. Findings funzionali e di affidabilità

### FUN-01 — Unificare la sorgente dati delle statistiche

**Priorità:** P1
**Evidenza:** `src/context/TransactionProvider.jsx:22-44`, `src/components/Stats/Stats.jsx:86-153`, `src/components/Dashboard/Dashboard.jsx:46-62`, `src/components/Analytics/TransactionAnalytics.jsx:47-66`.

`TransactionProvider` espone solo gli ultimi 50 documenti ordinati per `createdAt`. `Stats` calcola esclusivamente su questi; Dashboard interroga un range per `date`; Analytics carica tutto. Lo stesso periodo può quindi mostrare totali differenti nelle tre pagine, soprattutto con più di 50 movimenti o inserimenti retrodatati.

**Modifica richiesta:**

- creare un unico repository/query hook per range temporale;
- fare in modo che Dashboard, Stats, Analytics ed export usino la stessa semantica di intervallo e la stessa normalizzazione date;
- separare esplicitamente “recenti” (per UI) da “dataset del periodo” (per calcoli);
- valutare aggregazioni server-side/materializzate solo dopo aver corretto la consistenza.

**Test richiesti:** almeno 75 transazioni, 50 create di recente ma retrodatate, estremi del periodo, nessun movimento, solo entrate, solo uscite. I totali delle tre viste devono coincidere per lo stesso intervallo.

### FUN-02 — Rendere la registrazione idempotente e recuperabile

**Priorità:** P1
**Evidenza:** `src/components/Auth/Register.jsx:29-96`.

Auth user, `displayName`, profilo Firestore e email verification sono quattro operazioni non atomiche. Se `setDoc` fallisce, l'account Auth esiste già ma l'utente riceve un errore di registrazione. La validazione controlla `username.length` prima del `trim`: tre spazi passano il client check e falliscono più tardi. Il massimo 50 non è validato nel form.

**Modifica richiesta:**

- normalizzare prima di validare email e username;
- condividere uno schema Zod per create/update profilo;
- introdurre `ensureUserProfile(user)` idempotente eseguito al primo login e dopo registrazione;
- su fallimento parziale mostrare stato recuperabile e retry, oppure eliminare il nuovo Auth user soltanto se sicuro e appena creato;
- usare `serverTimestamp()` per timestamp profilo;
- non navigare alla dashboard dati prima della verifica email.

**Test richiesti:** username whitespace, 2/3/50/51 caratteri, Firestore offline dopo creazione Auth, `updateProfile` fallito, email verification fallita, retry dopo reload.

### FUN-03 — Applicare route guard coerenti e rimuovere il guard rotto

**Priorità:** P1
**Evidenza:** `src/router/AppRouter.jsx:90-108`, `src/utils/ProtectedRoute.jsx:1-18`.

Dashboard, Transactions, Analytics, Stats e Profile non sono protette nel router. Alcune viste implementano fallback locali, altre mostrano uno stato vuoto; Profile può essere aperto senza utente. Il file `ProtectedRoute.jsx` non è usato e importa `../components/Auth/AuthProvider`, percorso inesistente.

**Modifica richiesta:**

- definire guard di router riusabili:
  - `PublicOnlyRoute` per login/register;
  - `AppAccessRoute` per autenticato o demo;
  - `AuthenticatedRoute` per Profile/account;
  - `VerifiedRoute` per dati Firestore;
- preservare la destinazione richiesta tramite location state dopo login/verifica;
- rimuovere o correggere il vecchio `ProtectedRoute` solo dopo aver verificato gli import;
- assicurare che il layout/FAB non venga montato in contesti non autorizzati.

### FUN-04 — Rappresentare il denaro in unità minori intere

**Priorità:** P1
**Evidenza:** `src/schemas/transaction.jsx:3-11`, `firestore.rules:23`, riduzioni numeriche in `statsUtils.jsx` e nei provider.

Gli importi sono `number` floating point e l'input permette precisione decimale arbitraria. Valori come 0,1 + 0,2 non sono esattamente rappresentabili; il formatter nasconde l'errore, ma saldo, percentuali ed export possono divergere.

**Strategia di migrazione obbligatoria:**

1. definire `amountMinor` intero (centesimi) e `currency` ISO 4217, inizialmente `EUR`;
2. aggiungere un converter dual-read: preferire `amountMinor`, altrimenti convertire il legacy `amount` con una regola di rounding documentata;
3. durante la transizione scrivere il nuovo schema senza rompere i documenti legacy;
4. creare backup e script trusted/idempotente di migrazione con conteggi prima/dopo;
5. aggiornare rules per intero, range massimo e valuta ammessa;
6. solo dopo la verifica rimuovere il supporto legacy.

**Criteri di accettazione:** `0,10 + 0,20 = 0,30`, input con più di due decimali gestito esplicitamente, negativi/NaN/Infinity rifiutati, migrazione ri-eseguibile senza duplicazioni.

### FUN-05 — Gestire errori, retry e risposte fuori ordine

**Priorità:** P1
**Evidenza:** `src/components/Dashboard/Dashboard.jsx:46-62`, `src/components/Analytics/TransactionAnalytics.jsx:47-66`, `src/components/Transaction/TransactionList.jsx:151-220`.

Le funzioni async nei `useEffect` non hanno gestione completa degli errori. Un errore può lasciare loading attivo, produrre rejection non gestite o mostrare dati vecchi. Un cambio rapido del periodo può far arrivare una risposta precedente dopo quella nuova e sovrascrivere lo stato corretto.

**Modifica richiesta:**

- modellare ogni query con stati `idle/loading/success/empty/error`;
- usare request ID/cancellation flag per ignorare risposte stale;
- `try/catch/finally` in tutte le load/count/load-more/export;
- retry esplicito e messaggi distinti per offline, permission denied, missing index e quota;
- usare pending state per singola operazione e disabilitare submit/delete/duplicate finché la mutate è in corso;
- rendere create idempotente, per esempio generando un document ID client-side stabile per il singolo tentativo, così retry e doppio click non producono duplicati;
- mantenere i dati precedenti durante refresh solo con etichetta “aggiornamento”.

**Test richiesti:** promise rigettata, risposta A dopo B, unmount durante query, permission denied, missing index, offline/online.

### FUN-06 — Correggere merge realtime e cancellazioni cross-device

**Priorità:** P2
**Evidenza:** `src/components/Transaction/TransactionList.jsx:164-182`.

Quando è già stato caricato uno storico maggiore di 50 elementi, lo snapshot realtime viene fuso per aggiunta/overwrite, ma gli ID rimossi dallo snapshot non vengono eliminati. Una cancellazione da un altro dispositivo può quindi restare visibile fino a un reload completo.

**Modifica richiesta:**

- consumare `docChanges()` con `added/modified/removed`, oppure mantenere separati `recentRealtime` e pagine storiche con una strategia di invalidazione;
- non dedurre una cancellazione dalla sola assenza se un documento può essere uscito dal limite 50;
- invalidare/refetch della pagina interessata dopo mutate e su resume/focus, con throttling.

### FUN-07 — Correggere export PDF/CSV e rimuovere logica duplicata

**Priorità:** P2
**Evidenza:** `src/utils/pdfUtils.jsx:53-78`, `src/utils/pdfUtils.jsx:149-156`, `src/utils/pdfUtils.jsx:268-420`, `src/utils/pdfUtils.jsx:423-475`, `src/utils/exportFilename.js:13-16`.

Problemi osservati:

- il periodo settimanale PDF usa il default domenica, mentre le statistiche usano lunedì;
- l'importo medio di categoria divide per tutte le transazioni con quella categoria, anche fuori periodo o di tipo opposto;
- `generatePDFReport` ordina l'array ricevuto in place;
- `generatePeriodPDFReport` contiene commenti/HACK e duplica responsabilità;
- il filename ignora `periodText`, `startDate` ed `endDate`, quindi due report nello stesso minuto sono indistinguibili;
- la pagina Stats esporta il dataset limitato a 50;
- errori export non generano feedback UI affidabile.

**Modifica richiesta:**

- creare un modello puro `buildReportModel(transactions, range, locale)` condiviso da UI, CSV e PDF;
- generare documenti senza mutare input;
- includere periodo/range nel filename;
- aggiungere serializer e formatter testabili senza DOM;
- unificare i due generatori PDF e isolare soltanto `doc.save()` come side effect.

### FUN-08 — Normalizzare date e timezone con semantica esplicita

**Priorità:** P2
**Evidenza:** `src/components/Transaction/TransactionModal.jsx:42-47`, `:93-96`, `:119-130`; `src/utils/statsUtils.jsx:11-40`.

L'app tratta la data come giorno civile, ma la converte con `toISOString()` e `new Date('YYYY-MM-DD')`, cioè UTC. In timezone negativi la data mostrata può slittare; i custom range non sono sempre normalizzati allo stesso modo nelle statistiche estese. I sample demo conservano anche l'ora corrente, a differenza delle transazioni da form.

**Modifica richiesta:**

- scegliere un contratto: `dateKey: YYYY-MM-DD` per giorno civile, oppure timestamp a mezzogiorno UTC/local con converter unico;
- non usare `toISOString().split('T')[0]` per compilare input date locali;
- normalizzare sempre start a inizio giorno ed end a fine giorno con la stessa timezone;
- migrare/leggere il legacy senza cambiare la data percepita.

**Test richiesti:** Europe/Rome, America/Los_Angeles, DST start/end, ultimo giorno mese/anno, custom range con estremi inclusivi.

### FUN-09 — Validare cache e preferenze locali corrotte

**Priorità:** P2
**Evidenza:** `src/components/Analytics/TransactionAnalytics.jsx:38-42`.

Analytics esegue due `JSON.parse` non protetti nell'inizializzazione dello stato. Un valore corrotto in `analytics-period` fa fallire il rendering dell'intera route. Altri punti gestiscono già il parse con `try/catch`, ma senza schema.

**Modifica richiesta:** creare helper versionati e validati con Zod per preferenze, fallback sicuro e cleanup della chiave corrotta. Aggiungere un Error Boundary applicativo come ultima rete di sicurezza.

### FUN-10 — Migliorare accessibilità e coerenza i18n

**Priorità:** P2
**Evidenza:** `index.html:5-7`, `index.html:1`, `src/components/Dashboard/RecentTransactions.jsx:83-87`, `src/utils/notificationUtils.jsx:69-92`, `src/components/Stats/Stats.jsx:235-240`.

Problemi statici osservati:

- `user-scalable=no` e `maximum-scale=1` impediscono lo zoom;
- `<html lang="en">` è statico anche quando l'interfaccia è italiana;
- card recenti cliccabili sono `<div>` senza tastiera/ruolo;
- toast senza `aria-live`/role e pulsante close senza accessible name;
- alcuni icon button e show-password non hanno label;
- label del modal non sono sempre associate con `htmlFor`;
- quattro opzioni Stats sono hardcoded in italiano;
- le locale hanno due chiavi italiane assenti in inglese: `register.newUsername`, `register.updating`;
- grafici e gesture swipe richiedono alternative testuali/tastiera.

**Modifica richiesta:** correggere i punti sopra, sincronizzare `document.documentElement.lang`, aggiungere test axe e test keyboard. Non basarsi soltanto sul colore per distinguere entrate/uscite.

### FUN-11 — Completare le funzionalità account essenziali

**Priorità:** P2/P3
**Evidenza:** pagine Auth/Profile attuali.

Aggiunte consigliate, in ordine:

1. reset password via email;
2. cambio password/email con re-authentication;
3. export completo JSON/CSV e cancellazione account/dati;
4. gestione sessioni ed eventuale MFA se il target di rischio lo richiede;
5. stato chiaro di verifica email e recovery profilo.

Queste funzioni hanno precedenza su feature finanziarie avanzate perché chiudono il lifecycle dell'account.

### FUN-12 — Validare ogni write e non mascherare dati corrotti

**Priorità:** P2
**Evidenza:** `src/services/transactionService.jsx:25-30`, `:55-64`, `:238-265`; `src/context/DemoProvider.jsx:32-46`, `:88-110`.

Solo la create Firebase passa da `transactionInputSchema`. L'update inoltra un oggetto raw; la modalità demo non applica lo schema; la lettura converte amount invalido a zero e date mancanti a “adesso”, trasformando corruzione in dati apparentemente validi.

**Modifica richiesta:**

- definire schema separato per create, patch update, documento persistito e cache;
- validare create/update sia Firebase sia demo;
- applicare lo schema/converter anche in lettura;
- non sostituire silenziosamente data invalida con ora corrente o amount invalido con zero;
- isolare i record invalidi, mostrare errore recuperabile e produrre diagnostica priva di dati sensibili;
- mantenere client validation e rules semanticamente allineati tramite test fixture condivise dove possibile.

## 7. Findings di prestazioni e costi

### PERF-01 — Implementare vera paginazione Firestore

**Priorità:** P1
**Evidenza:** `src/services/transactionService.jsx:106-115`, `src/components/Transaction/TransactionList.jsx:184-198`.

`handleLoadMore` chiama `fetchAllTransactions`, che usa `getDocs` senza `limit`, cursor o page size. Una sola intersezione del sentinel scarica tutto e imposta `hasMore=false`. Questo non è infinite scroll e scala linearmente in document reads, memoria, sorting e storage.

**Modifica richiesta:**

- API repository `fetchPage({ userId, type, startDate, endDate, pageSize, cursor })`;
- `orderBy('date','desc')`, tie-break deterministico `orderBy(documentId())` se supportato dal disegno degli indici;
- `limit(pageSize)` e `startAfter(lastDocument)`;
- risultato `{ items, nextCursor, hasMore }`;
- ricerca testuale: dichiarare che è client-side solo sulle pagine caricate, oppure integrare un indice di ricerca dedicato; non fingere ricerca globale;
- aggiornare gli indici necessari e testare con emulator;
- aggiungere l'indice `userId + type + date` se resta supportata la combinazione type/range: il service la costruisce in `transactionService.jsx:107-111`, ma `firestore.indexes.json` contiene `userId + type + createdAt`, non la variante ordinata per `date`.

**Criteri di accettazione:** con 1.000 documenti la prima pagina legge al massimo `pageSize` documenti; ogni scroll aggiunge una pagina; nessun duplicato o salto con date uguali.

### PERF-02 — Rendere il preload selettivo e alleggerire il bootstrap

**Priorità:** P2
**Evidenza:** `src/router/AppRouter.jsx:69-88`, `src/components/Layout/AppLayout.jsx:7`, output `npm run analyze`.

Dimensioni build osservate:

| Chunk | Raw | Gzip |
|---|---:|---:|
| main `index-*.js` | 359,49 kB | 114,60 kB |
| `TransactionAnalytics-*` | 427,94 kB | 121,60 kB |
| `pdfUtils-*` | 424,85 kB | 136,86 kB |
| `TransactionList-*` | 38,78 kB | 13,55 kB |
| CSS principale | 48,59 kB | 9,38 kB |
| maggior chunk Firebase | 356,05 kB | 108,27 kB |

Il router precarica Analytics per ogni utente autenticato durante idle, vanificando parte del lazy loading. `AppLayout` importa sempre `TransactionModal`, quindi dialog/modal e dipendenze entrano nel bootstrap anche sulla landing dove il FAB non appare. `firebase.jsx` importa insieme Auth e Firestore: la landing pubblica necessita lo stato Auth, ma finisce per caricare anche Firestore.

**Modifica richiesta:**

- non precaricare Analytics automaticamente; precaricarlo su intent (`pointerenter`, focus o visibilità del link) e solo senza Save-Data/connessione lenta;
- lazy-load del modal quando il FAB viene aperto;
- separare `firebaseApp`, `firebaseAuth` e `firebaseFirestore` in moduli per capability;
- valutare import Recharts più granulari solo dopo nuova bundle analysis;
- impostare budget CI per main e route chunk.

**Budget iniziali proposti:** main < 90 kB gzip; landing + auth bootstrap < 200 kB gzip; nessuna route non visitata richiesta automaticamente su Save-Data.

### PERF-03 — Correggere la semantica stale-while-revalidate

**Priorità:** P2
**Evidenza:** `src/services/transactionService.jsx:69-159`, `:161-236`.

Il default `revalidateIfFresh=true` fa partire una query di rete anche quando la cache è fresca. Il TTL di tre minuti migliora solo il first paint, non riduce le reads. Chiamate concorrenti non sono deduplicate. Ogni range produce una copia completa in `localStorage`, con rischio quota.

**Modifica richiesta:**

- default `revalidateIfFresh=false`, oppure documentare chiaramente l'intento;
- deduplicare le promise in-flight per chiave query;
- invalidare per utente/query interessata invece di enumerare tutto `localStorage`;
- limitare dimensione/numero entry e usare LRU se si mantiene la cache;
- registrare cache hit/miss e reads in ambiente di test.

### PERF-04 — Evitare full history e calcoli ripetuti in Analytics

**Priorità:** P2
**Evidenza:** `src/components/Analytics/TransactionAnalytics.jsx:47-172`.

Analytics scarica sempre tutto, anche per “questo mese”. Il trend ultimi sei mesi filtra l'intero array sei volte, oltre ai filtri per categorie e top transaction. Per piccoli dataset va bene; con anni di movimenti aumenta costo e main-thread work.

**Modifica richiesta:**

- query soltanto il range massimo necessario tra periodo selezionato e ultimi sei mesi;
- aggregare in un singolo passaggio per mese/categoria/tipo;
- per volumi elevati introdurre summary mensili materializzati via trusted backend, con idempotenza e riconciliazione;
- virtualizzare liste, non i piccoli riepiloghi.

### PERF-05 — Migliorare caching hosting e risorse statiche

**Priorità:** P2/P3
**Evidenza runtime:** asset hashato live con `cache-control: max-age=600`; `index.html:80-83`; file in `public/`.

Gli asset hashati sono serviti con cache di soli 10 minuti dal setup GitHub Pages osservato. Il font Google introduce una catena cross-origin e implicazioni privacy. `icon.png` è 1200×1200/72 kB ed è usato anche come favicon; `favicon.ico` è in realtà un PNG 1200×1200 da 72 kB; `icon.svg` pesa circa 40 kB e contiene stile verboso.

**Modifica richiesta:**

- su hosting configurabile: HTML `no-cache`/short TTL, asset hashati `public,max-age=31536000,immutable`;
- self-host di font WOFF2, subset ai pesi realmente usati e `font-display: swap`;
- generare favicon e icone PWA nelle dimensioni corrette, inclusa maskable;
- eliminare asset non referenziati solo dopo verifica build/manifest.

### PERF-06 — Rimuovere dipendenze e codice non usati

**Priorità:** P3
**Evidenza:** ricerca import nel tree.

Elementi apparentemente non usati:

- dipendenza `dayjs` e `src/utils/dayjs-setup.jsx`;
- `src/utils/animationConfig.jsx`;
- `src/utils/ProtectedRoute.jsx` nella forma attuale;
- `generateCsvFileName` deprecato;
- `src/components/ui/textarea.jsx`;
- package Radix Popover, Select, Tabs e Tooltip non importati dall'app;
- parte del design system CSS legacy.

Rimuovere soltanto dopo `rg`, build e smoke test. Spostare in `dependencies` i package Radix/Lucide effettivamente usati a runtime, anche se il deploy statico attuale li bundle-a durante la build.

## 8. Testing, CI/CD e osservabilità

### TEST-01 — Costruire una piramide di test proporzionata al rischio

**Priorità:** P1
**Evidenza:** `tests/downloadUtils.test.mjs` contiene soltanto 2 test.

Suite minima proposta:

#### Unit test

- schema transaction/profile;
- conversione amount ↔ minor units e rounding;
- intervalli date/timezone;
- `calculateStats` e report model;
- serializer CSV anti-formula;
- filename export;
- cache versioning e fallback preferenze corrotte.

#### Component/integration test

- Login/Register/Verify Email con Firebase mock controllato;
- guard delle route;
- TransactionModal create/edit validation;
- lista paginata e deduplica;
- dashboard/stats/analytics coerenti sullo stesso fixture;
- error, retry, empty e loading state;
- tastiera, focus e axe sulle viste principali.

#### Firestore rules test con Emulator Suite

- owner verified CRUD consentito;
- unverified negato sulle transazioni;
- non-owner negato;
- query senza corretto filtro negata;
- campi extra/tipi/range invalidi negati;
- immutabilità UID, email, createdAt;
- profilo owner consentito, list negata.

#### E2E

- registrazione → verifica simulata → CRUD → analytics → export → logout;
- login e reset password;
- demo completa e limite 10;
- deep link GitHub Pages;
- account deletion su ambiente emulator/test;
- mobile viewport e navigazione keyboard.

### TEST-02 — Separare quality gate e deploy

**Priorità:** P1
**Evidenza:** `.github/workflows/deploy.yml:18-64` esegue `npm ci` e build, ma non lint/test/audit.

**Modifica richiesta:**

- job `quality`: `npm ci`, lint, unit/component, rules emulator, build e budget bundle;
- job E2E su preview/emulator;
- deploy dipendente da tutti i gate;
- active LTS Node coerente tra Volta, locale e CI, non una release odd short-lived;
- pin delle GitHub Actions a commit SHA con aggiornamento automatizzato;
- artifact retention minima e nessun secret esposto nei log;
- workflow distinto e approvato per deploy delle Firestore rules/indexes.

### TEST-03 — Aggiungere error boundary e osservabilità privacy-aware

**Priorità:** P2
**Evidenza:** errori prevalentemente inviati a `console.*`; nessun error boundary o SDK di monitoring.

**Modifica richiesta:**

- Error Boundary globale con recovery/reload;
- logger strutturato con codici errore e ambiente;
- monitoring di error rate, web vitals e Firebase denials/costi;
- non inviare email, descrizioni, importi o ID documento a telemetry;
- sampling e consenso coerenti con privacy policy;
- release/version tag per correlare errori al deploy.

## 9. Migliorie di prodotto consigliate

Queste aggiunte vanno implementate solo dopo i P1/P2 di correttezza e sicurezza.

### 9.1 Alta utilità

1. **Budget mensili per categoria** con soglia e progressivo; usare minor units.
2. **Transazioni ricorrenti** con conferma della materializzazione e gestione timezone.
3. **Import/export portabile** JSON versionato e CSV con preview, validazione e rollback.
4. **Ricerca e filtri persistenti** con semantica chiara tra pagina caricata e intero dataset.
5. **Confronto periodi** mese su mese/anno su anno con range uniformi.
6. **Backup e ripristino** controllati, prima di edit massivi o import.

### 9.2 Utili ma successive

- obiettivi di risparmio;
- tag personalizzati separati dalle categorie;
- note/allegati solo dopo threat model e regole Storage dedicate;
- multi-valuta solo con modello esplicito di valuta per transazione e tassi storici;
- PWA/offline solo con strategia chiara per cache di dati sensibili e conflitti di sincronizzazione.

### 9.3 Da non introdurre prematuramente

- microservizi per un'app ancora client/Firebase;
- cifratura “finta” con chiave inclusa nel frontend;
- aggregazioni duplicate senza processo di riconciliazione;
- ricerca globale dichiarata ma applicata soltanto ai primi N record;
- service worker che cache-a indiscriminatamente risposte o dati autenticati.

## 10. Modello target consigliato

### 10.1 Modulo dati

Creare un repository Firestore con contratti espliciti:

```text
subscribeRecent({ userId, limit }) -> unsubscribe
fetchPage({ userId, range, type, pageSize, cursor }) -> { items, nextCursor, hasMore }
fetchRange({ userId, range, type }) -> items
count({ userId, range?, type? }) -> number
create(input) -> transaction
update(id, patch) -> void
remove(id) -> void
```

Il repository deve essere l'unico punto che:

- converte Timestamp/dateKey;
- converte importi legacy/minor units;
- traduce error code Firebase in errori dominio;
- applica cache/deduplica;
- conosce query e indici.

### 10.2 Stato UI

Non usare un singolo booleano `loading` per stream, mutate e query. Preferire stati separati:

```text
recentQuery.status
periodQuery.status
pagination.status
mutationById[id].status
```

In questo modo l'aggiunta di una transazione non nasconde l'intera pagina con uno skeleton e una query fallita non viene scambiata per dataset vuoto.

### 10.3 Schema transazione target

Esempio da adattare con migrazione:

```json
{
  "userId": "uid",
  "amountMinor": 12345,
  "currency": "EUR",
  "description": "Spesa settimanale",
  "dateKey": "2026-08-04",
  "category": "supermercato",
  "type": "expense",
  "createdAt": "server timestamp",
  "updatedAt": "server timestamp",
  "schemaVersion": 2
}
```

Non effettuare la migrazione senza backup, dry run, conteggi di riconciliazione e rollback documentato.

## 11. Piano di verifica completo

### 11.1 Comandi automatici minimi

```bash
npm ci
npm run lint
npm test
npm run build
npm run analyze
npm audit --omit=dev
npm audit
```

Aggiungere script dedicati per rules, component ed E2E quando introdotti. Nessun deploy deve dipendere da controlli manuali non registrati.

### 11.2 Dataset fixture obbligatori

- utente A verificato, utente B verificato, utente C non verificato;
- 0, 1, 49, 50, 51, 75 e 1.000 transazioni;
- date duplicate e `createdAt` differente;
- transazioni retrodatate create oggi;
- importi 0,01; 0,10; 0,20; 999.999,99; limite; oltre limite;
- categorie condivise tra income/expense (`altro`);
- descrizioni Unicode, multilinea, 200/201 caratteri e formula-like;
- periodi su fine mese, fine anno e DST.

### 11.3 Non-regressione funzionale

- totale e conteggio identici tra Dashboard, Stats, Analytics ed export per lo stesso range;
- create/update/delete riflessi senza reload e su seconda sessione;
- paginazione senza duplicati/salti;
- demo isolata dai dati autenticati;
- logout pulisce dati locali sensibili;
- verifica email sblocca i dati senza logout/login obbligatorio;
- profilo recuperabile dopo registrazione parzialmente fallita.

### 11.4 Sicurezza

- rules emulator completo;
- dependency audit;
- test CSP in report-only;
- verifica manuale App Check e key restrictions;
- test CSV injection;
- session/account deletion test su ambiente non produttivo;
- secret scan in CI, incluso history/commit introdotti nella PR.

### 11.5 Prestazioni

Il workflow `web-perf` non ha potuto raccogliere Core Web Vitals perché il server Chrome DevTools MCP non era configurato nella sessione di audit. Completare quindi una misura ripetibile su build production con profilo mobile cold-cache:

- LCP, CLS, INP e TTFB;
- FCP, TBT e Speed Index;
- numero richieste e transfer size per landing, dashboard, transactions e analytics;
- long tasks durante parsing grafici/PDF;
- letture Firestore per primo load, cambio periodo e ogni pagina;
- test Save-Data e rete lenta;
- accessibility snapshot/axe.

Salvare baseline e budget in CI. Non dichiarare miglioramenti prestazionali senza confronto prima/dopo sullo stesso profilo.

## 12. Roadmap di implementazione consigliata

### Fase 0 — Safety net

1. introdurre test runner React, Firebase Emulator e test rules;
2. aggiungere quality workflow separato dal deploy;
3. creare fixture condivise e baseline bundle;
4. aggiungere Error Boundary e gestione errori minima.

**Exit criteria:** CI blocca lint/test/build/rules falliti; nessun comportamento modificato senza test.

### Fase 1 — Sicurezza e identità

1. SEC-01 dipendenze;
2. SEC-02 verifica email/token;
3. SEC-03 rules profilo;
4. FUN-02 registrazione idempotente;
5. FUN-03 route guard;
6. SEC-04 cache/logout;
7. verifiche manuali SEC-07.

**Exit criteria:** utente non verificato non entra nei flussi dati; rules testate; audit runtime risolto; logout pulisce cache.

### Fase 2 — Correttezza dati

1. repository dati unificato;
2. FUN-01 coerenza viste;
3. FUN-04 minor units con dual-read;
4. FUN-08 date/timezone;
5. FUN-07 report model/export;
6. migrazione dati con backup e riconciliazione.

**Exit criteria:** stesse cifre in tutte le viste/export; test precisione e timezone verdi; legacy ancora leggibile fino a fine migrazione.

### Fase 3 — Scalabilità e prestazioni

1. PERF-01 paginazione;
2. PERF-03 cache/deduplica;
3. PERF-04 query Analytics;
4. PERF-02 split/preload;
5. PERF-05 hosting/static assets;
6. misure Web Vitals e Firebase reads prima/dopo.

**Exit criteria:** page-size rispettata con 1.000 record; budget bundle rispettato; nessun preload Analytics su landing/Save-Data.

### Fase 4 — Accessibilità, account e prodotto

1. FUN-10 accessibilità/i18n;
2. FUN-11 lifecycle account;
3. SEC-05 header/CSP e SEC-08 data lifecycle;
4. monitoring privacy-aware;
5. soltanto dopo, budget/ricorrenze/import.

## 13. Istruzioni precise per l'LLM implementatore

Per ogni fase:

1. leggere i file citati e verificare che linee e comportamento non siano cambiati;
2. riportare `git status --short` e preservare modifiche preesistenti;
3. scrivere prima i test di regressione che dimostrano il difetto;
4. applicare la modifica minima, senza refactoring laterali;
5. eseguire i controlli pertinenti e includere output sintetico;
6. aggiornare README/runbook soltanto per comportamento realmente implementato;
7. indicare separatamente attività manuali non eseguite;
8. non creare commit, push, deploy o modifiche Firebase remote senza autorizzazione;
9. non usare `npm audit fix --force` o migrazioni distruttive automatiche;
10. per schema/rules, mantenere un periodo dual-read e definire rollback.

Formato consigliato per la chiusura di ogni finding:

```markdown
- Finding: FUN-01
- Stato: risolto / parziale / bloccato
- File modificati: ...
- Contratti cambiati: ...
- Migrazione necessaria: sì/no, dettagli
- Test aggiunti: ...
- Verifiche eseguite: ...
- Rischi residui: ...
- Attività manuali: ...
```

## 14. Verifiche eseguite durante questo audit

| Verifica | Esito |
|---|---|
| Stato working tree iniziale | pulito |
| Inventario file/configurazione | completato |
| Analisi flussi Auth → provider → service → Firestore rules | completata staticamente |
| `npm run lint` | passato |
| `npm test` | passato: 2/2 test |
| `npm run build` | passato |
| `npm run analyze` | passato; bundle report generato in `dist/` ignorata da git |
| `npm audit` | 1 high, 3 moderate, 0 critical |
| `npm audit --omit=dev` | 2 moderate runtime, 0 high/critical |
| Scansione segreti nel tree corrente | nessun segreto reale rilevato; solo placeholder |
| Parità chiavi locale | 2 chiavi presenti solo in italiano |
| Header sito live | HSTS presente; header hardening principali assenti |
| Core Web Vitals runtime | non eseguiti: Chrome DevTools MCP non configurato |
| Firebase Console/App Check/rules deployate | non verificabili dal repository |
| Test Firestore rules | non esistenti/non eseguiti |
| E2E browser | non esistenti/non eseguiti |

## 15. Limitazioni e assunzioni

- Audit prevalentemente statico, integrato da build, dependency audit, bundle analysis e verifica HTTP del deployment.
- Nessun accesso alla Firebase Console, ai dati reali, ai log, alle quote o alle regole effettivamente deployate.
- Nessun account di test e nessuna modifica remota eseguita.
- Nessun test di carico con dataset reale.
- Nessuna verifica della git history completa per segreti; la scansione riguarda il tree corrente.
- Le dimensioni bundle sono quelle della build locale del 4 agosto 2026 e possono cambiare dopo aggiornamenti.
- I rilievi sui costi Firestore sono dedotti dalle query osservate; i costi reali dipendono da volume e traffico.

## 16. Definition of Done complessiva

L'app può essere considerata sensibilmente migliorata quando:

- non presenta vulnerabilità runtime note high/critical e gli advisory Router sono risolti;
- rules e flussi Auth sono coperti da emulator test;
- verifica email, registrazione parziale e route guard hanno percorsi deterministici;
- tutte le viste e gli export producono gli stessi risultati sullo stesso range;
- il denaro usa minor units con migrazione verificata;
- lista e analytics non scaricano l'intera cronologia senza necessità;
- gli errori di rete/permesso hanno stato e retry, senza loading infinito;
- cache locale sensibile e logout hanno una policy verificata;
- CI esegue lint, test, rules, build, E2E essenziali e budget bundle prima del deploy;
- header/CSP e configurazione Firebase remota sono verificati e documentati;
- accessibilità base, zoom, tastiera, lingua documento e toast superano i test;
- Web Vitals e Firestore reads sono misurati con baseline e budget;
- lifecycle account include recovery, export e cancellazione completa dei dati.
