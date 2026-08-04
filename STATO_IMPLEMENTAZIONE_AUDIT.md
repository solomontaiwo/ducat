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
