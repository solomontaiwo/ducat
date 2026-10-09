# Stato implementazione audit

> Branch: `feature/audit-intervention`
> Data: 4 agosto 2026
> Baseline e criteri originali: `AUDIT_COMPLETO.md`
> Configurazione remota: `CONFIGURAZIONE_MANUALE.md`

## 1. Sintesi

Tutti i finding P1/P2 con soluzione applicabile nel repository sono stati implementati. Le attività che richiedono accesso a Firebase, Google Cloud, GitHub o al provider di hosting sono predisposte ma restano manuali. Le evoluzioni prodotto della sezione 9 dell’audit non sono finding né requisiti chiusi: export JSON, trend periodici e chiarezza della ricerca paginata sono inclusi; budget, ricorrenze, import massivo, obiettivi e multi-valuta restano backlog deliberato per non ampliare lo schema prima del consolidamento della migrazione v2.

## 2. Matrice finding

| ID | Stato | Implementazione/evidenza |
|---|---|---|
| SEC-01 | Risolto | Rimosso React Router vulnerabile, router interno con test anti-open-redirect, Firebase/PostCSS aggiornati; audit runtime frontend senza vulnerabilità. |
| SEC-02 | Risolto | Route verifica email, cooldown, reload utente/token, guard verified e nessun listener/FAB prima della verifica. |
| SEC-03 | Risolto | Rules profilo con allowlist, tipi, lunghezze, timestamp, email/token e test Emulator positivi/negativi. |
| SEC-04 | Risolto | Rimossa cache finanziaria `localStorage`; cache solo memoria, invalidazione prima del logout e storage helper fail-safe. La demo resta locale per definizione. |
| SEC-05 | Parziale/manuale | Meta CSP applicabile, nessuno script inline/font remoto; header completi e caching richiedono hosting configurabile, con valori nel runbook. |
| SEC-06 | Risolto | Serializer CSV RFC 4180, BOM/CRLF e neutralizzazione formula con test. |
| SEC-07 | Manuale | Checklist verificabile per App Check, Auth, domain, API key, alert e quote. App Check Enterprise integrato nel client. |
| SEC-08 | Risolto/manuale deploy | Export JSON, re-auth, password/email lifecycle, privacy/termini e callable trusted App Check per cancellazione cascata; deploy remoto da eseguire. |
| FUN-01 | Risolto | Dashboard, Stats, Analytics ed export interrogano range coerenti; stream recente separato dai dataset di calcolo. |
| FUN-02 | Risolto | Schema profilo condiviso, normalizzazione, server timestamp ed `ensureUserProfile` idempotente dopo login/registrazione. |
| FUN-03 | Risolto | Guard public-only/authenticated/unverified/app, destinazioni sicure e rimozione del guard rotto. |
| FUN-04 | Risolto/transizionale | `amountMinor` intero, `currency`, dual-read, dual-write, calcoli esatti, rules e script migrazione idempotente. |
| FUN-05 | Risolto | Error/loading/retry, request ID contro race, pending mutation e ID create stabile per retry. |
| FUN-06 | Risolto | Cambio realtime invalida e ricarica la prima pagina deterministica; delete locale solo dopo successo. |
| FUN-07 | Risolto | Modello report puro condiviso, nessuna mutazione input, medie corrette, filename univoco e CSV unico. |
| FUN-08 | Risolto/transizionale | `dateKey` civile, converter centralizzati, range inclusivi e dual-read del timestamp legacy. |
| FUN-09 | Risolto | Preferenze validate/fallback, storage fail-safe ed Error Boundary globale. |
| FUN-10 | Risolto | Zoom riabilitato, lang sincronizzato, controlli tastiera/label, toast live, periodi tradotti, contrasto e test axe desktop/mobile. |
| FUN-11 | Risolto | Reset password, cambio email con re-auth, verifica, export e cancellazione completa account. |
| FUN-12 | Risolto | Schemi create/patch, validazione Firebase/demo, letture invalide isolate e diagnostica senza payload. |
| PERF-01 | Risolto | Cursor Firestore, `limit(40)`, ordinamento `date + documentId`, count server e indici; ricerca dichiarata sulle pagine caricate. |
| PERF-02 | Risolto con budget iniziale | Preload singola route e network-aware, modal lazy, Firebase per capability e budget CI. Entry osservata circa 119 kB gzip, sotto il budget 145 kB ma sopra il target aspirazionale 90 kB dell’audit. |
| PERF-03 | Risolto | Cache memoria TTL, default senza revalidate, deduplica in-flight e invalidazione centralizzata. |
| PERF-04 | Risolto | Analytics interroga solo un range massimo necessario e riusa memo/modello; niente full history di default. |
| PERF-05 | Parziale/manuale | Font di sistema, icone 32/192/512 reali; header cache richiedono hosting configurabile. |
| PERF-06 | Risolto | Rimossi router/dayjs/dead code e package inutilizzati; dipendenze runtime classificate correttamente. |
| TEST-01 | Risolto per i flussi critici | Unit/component per denaro, date, CSV, report, export, storage e router; rules Emulator; E2E demo/deep-link/axe desktop-mobile. Auth email reale e callable richiedono staging. |
| TEST-02 | Risolto | Job quality su ogni branch/PR, job Functions Node 22 e deploy Pages solo su `main` dopo entrambi. |
| TEST-03 | Parziale/manuale | Error Boundary e messaggi recoverable presenti; provider remoto di error monitoring resta una scelta privacy/operativa. |

## 3. Modifiche architetturali principali

- router SPA minimale proprietario con basename e sole destinazioni same-origin;
- moduli Firebase separati per app, Auth, Firestore e App Check;
- repository transazioni con normalizzazione legacy/v2, cache memoria, query range e pagine cursor;
- modello monetario in centesimi e data civile `YYYY-MM-DD`;
- report model e serializer CSV puri;
- Cloud Function Gen 2 Node 22 per cancellazione account;
- script Admin dry-run/apply per migrazione transazioni;
- quality gate riproducibile con Node 24, Java 21, Node 22 Functions e Chromium.

## 4. Verifiche eseguite

| Verifica | Esito osservato |
|---|---|
| ESLint | verde, 0 errori/warning |
| Unit/component Vitest | verde; include i nuovi helper critici |
| Firestore Rules Emulator | verde, 7 test |
| Build Vite produzione | verde |
| Bundle budget | verde; main ~119 kB, Analytics ~122 kB, PDF ~136 kB gzip |
| Playwright E2E | verde, 4 test: desktop/mobile, demo, deep link e axe serious/critical |
| `npm audit --omit=dev` frontend | 0 vulnerabilità |
| parse sorgenti Functions/migrazione | verde con `node --check` |
| audit Functions high/critical | verde; advisory moderate transitivi documentati sotto |

## 5. Rischi residui e limitazioni

1. `firebase-admin@14.2.0` e `firebase-functions@7.3.2` espongono al 4 agosto 2026 advisory npm **moderate** nella catena opzionale Google Cloud Storage/`uuid`. La Function usa soltanto Auth e Firestore, non Storage. Non è stata applicata una risoluzione forzata/downgrade suggerita da npm perché incompatibile; il gate blocca high/critical e Dependabot monitora l’upstream.
2. L’audit npm completo del root conserva advisory **moderate** transitivi di `firebase-tools` (OpenTelemetry/Google client/`uuid`), usato soltanto in sviluppo ed Emulator Suite. Il fix non-forzato ha rimosso l’unico advisory high; `npm audit --omit=dev` è pulito. Un `--force` proporrebbe un downgrade breaking e non è stato applicato.
3. Il runtime locale disponibile durante l’intervento è Node 26; package e CI fissano frontend/CLI a Node 24 e Functions a Node 22. Le API usate sono compatibili e il parse è verde, ma il job CI costituisce la prova autoritativa sui runtime dichiarati.
4. La meta CSP è utile ma non può applicare `frame-ancestors`; gli header e il caching annuale degli asset richiedono il cambio/configurazione hosting.
5. Nessuna configurazione Firebase/Google/GitHub remota è stata modificata. Rules, indici, Function, App Check, backup e migrazione devono seguire il runbook.
6. Privacy e Termini includono placeholder tecnici: serve approvazione del titolare/consulente prima del rilascio pubblico.
7. Il chunk Firebase più grande resta superiore a 500 kB raw, pur essendo separato e lazy rispetto alle route pubbliche. Il budget controlla gzip dei chunk percepiti principali; ulteriori riduzioni vanno misurate su device reali.

## 6. Ordine di consegna a un altro LLM

1. leggere questo file e `CONFIGURAZIONE_MANUALE.md`;
2. non rimuovere i campi legacy `amount`/`date` prima della riconciliazione produzione;
3. eseguire l’intera pipeline nella sezione 12 del runbook;
4. distribuire staging nell’ordine indici → rules → frontend App Check → Function → enforcement;
5. fare backup, dry-run, apply e riconciliazione della migrazione;
6. completare soltanto dopo le attività manuali la checklist di rilascio.

## 10. Interventi del 9 ottobre 2026 (audit di follow-up)

| Area | Intervento | Verifica |
|---|---|---|
| CSP | `connect-src` ora include `https://*.cloudfunctions.net` (callable `deleteAccount`); `script-src`, `frame-src` e `connect-src` includono `https://www.google.com/recaptcha/` (App Check Enterprise). Aggiornato anche l'header proposto in `CONFIGURAZIONE_MANUALE.md`. | `tests/csp.test.js`. **Da confermare nel browser con la configurazione Firebase reale.** |
| Creazione idempotente | Un retry con lo stesso ID, già salvato dal primo tentativo, veniva rifiutato dalle rules (update con `createdAt` diverso). `TransactionService.add` ora verifica che il documento esista e appartenga all'utente prima di segnalare errore. | `tests/transactionRetry.test.js`, `tests/firestore.rules.test.js` |
| Rules | `create` accetta solo lo schema v2; il ramo legacy resta valido solo per `update` di documenti legacy esistenti, e un documento v2 non può tornare legacy. Test su delete, profilo e `usernames`. | 13 test sull'Emulator |
| Function `deleteAccount` | Logica estratta in `functions/lib/deleteAccount.js`; cancellazione con `BulkWriter` a pagine, errore esplicito se una delete fallisce, retry sicuro (profilo/utente già assenti), `timeoutSeconds: 540`, `maxInstances: 10`, log strutturati senza dati personali. | `functions/test/deleteAccount.test.js` (7 test, `node --test`) |
| Dipendenze | `@radix-ui/react-dialog`, `class-variance-authority`, `lucide-react` spostati in `dependencies` (finiscono nel bundle e ora sono coperti da `npm audit --omit=dev`); rimossi `tailwind-merge` e `@radix-ui/react-slot` (inutilizzati). Override di `@grpc/grpc-js` per `@firebase/firestore`, `dompurify` aggiornato, `functions/package-lock.json` aggiornato: 0 vulnerabilità high/critical su entrambi i package. | `npm audit --omit=dev` |
| Build | `build.rolldownOptions` era ignorato da Vite 7; sostituito con `rollupOptions.output.manualChunks` limitato a `react` e `motion` (nessun chunk "vendor" generico, per non fondere recharts/jspdf). Budget aggiornati: main 100 kB, iniziale 160 kB (misurato 142 kB), analytics 150 kB, pdf 155 kB gzip. | `npm run check:bundle` |
| Refactor | `UnifiedTransactionProvider` con un solo valore "inerte" condiviso e valori di contesto memoizzati (anche Auth, Theme, Notification, Demo, Transaction); `propTypes` fuori dai corpi dei componenti; `TransactionAnalytics` 828 → 479 righe (modello, hook dati, export, tooltip e card categoria estratti); `TransactionList` 654 → 462 righe (card swipe, dialog azioni/eliminazione, raggruppamento e ordinamento estratti). | test unitari/componente |
| Error reporting | `src/utils/errorReporting.js`: nessun invio se `VITE_ERROR_REPORT_URL` è vuoto; report con testo ripulito (email, query string, numeri lunghi), senza uid, deduplicati e limitati a 5 per sessione; collegato a `ErrorBoundary`, `window.error` e `unhandledrejection`. Per attivarlo aggiungere l'origine dell'endpoint a `connect-src`. | `tests/errorReporting.test.jsx` |
| i18n | Auth (login, registrazione, verifica email, recupero password), `ErrorBoundary`, loader, `TransactionList`, footer landing, errori monetari (`MoneyError.i18nKey`) e messaggi dello schema profilo ora usano le chiavi IT/EN; allineate due chiavi EN mancanti. Il testo legale di `LegalPage` resta solo in italiano: va rivisto dal titolare prima della traduzione. | `tests/i18nParity.test.js` |
| Test | Da 60 a 135 test unitari/componente (+ 13 rules, 7 Function). Coverage con soglia in CI (`npm run test:coverage`): misurata 48,9% statements / 41,4% branches / 43,5% functions / 50,0% lines su tutto `src`, contro il 32,5% di partenza. Nuovi: flussi di autenticazione, servizi account/profilo, Analytics, retry, CSP, error reporting. | `npm run test:all` |
| Bug trovato dai test | `ForgotPassword` lasciava una promise rifiutata non gestita se l'invio falliva; ora mostra sempre la stessa conferma neutra. | `tests/authFlows.test.jsx` |

### Da eseguire manualmente dopo il merge

1. `firebase deploy --only firestore:rules,functions` (nuove rules e nuova versione di `deleteAccount`).
2. Verificare in produzione, con App Check attivo, la cancellazione account e l'assenza di violazioni CSP nella console del browser.
3. Prima di rimuovere del tutto il ramo legacy dalle rules, completare la migrazione con `functions/scripts/migrate-transactions-v2.mjs` (dry-run, poi apply).
4. Se si vuole il monitoraggio errori: impostare `VITE_ERROR_REPORT_URL` nei secret di build e aggiungere l'origine a `connect-src`.
