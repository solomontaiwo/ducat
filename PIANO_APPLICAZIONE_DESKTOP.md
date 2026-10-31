# Piano di realizzazione dell'applicazione desktop Soldi Sotto

Data dell'analisi: 31 ottobre 2026. Stato: **piano di lavoro, non implementazione**.

## 1. Obiettivo e istruzioni per chi realizza

Realizzare un'applicazione desktop installabile e avviabile autonomamente, mantenendo disponibile l'attuale web app. L'app desktop deve riutilizzare l'interfaccia React e il progetto Supabase esistenti, incorporare gli asset dell'interfaccia nel pacchetto e funzionare senza server Vite o scheda browser aperti. La connessione Internet resta necessaria per le funzioni con account e sincronizzazione.

Questo documento è una guida operativa per una successiva sessione di sviluppo, anche affidata a un LLM. Prima di agire, rileggere le istruzioni del repository e lo stato effettivo dei file: il progetto o le versioni delle librerie potrebbero essere cambiati. I percorsi indicati come **nuovi/proposti** non esistono necessariamente oggi. Non interpretare esempi e ipotesi come codice già presente.

Vincoli da rispettare:

- Conservare comportamento e deploy della versione web, comprese funzionalità PWA esistenti, contratti pubblici, schema e regole RLS, salvo modifiche puntuali motivate e verificate.
- Preservare il working tree esistente; non modificare `.env`, credenziali o configurazioni Supabase remote senza autorizzazione esplicita. Nessun commit, push, pubblicazione o operazione distruttiva non richiesta.
- Non creare nuovi file o classi di test: integrare soltanto quelli già presenti. Non introdurre dipendenze di test. Usare verifiche manuali documentate per ciò che richiede l'app desktop installata.
- Implementare per fasi, eseguendo i controlli di uscita prima di passare alla successiva. Non dichiarare supportata una piattaforma o una funzione senza averla verificata.
- In caso di limite di ambiente o accesso, completare il lavoro indipendente, riportare la verifica come non eseguita e non inventare risultati.

### Scelte iniziali di progetto

| Aspetto | Decisione per la prima versione |
|---|---|
| Contenitore | Tauri 2, frontend React/Vite esistente, asset locali incorporati. |
| macOS | Apple Silicon `aarch64-apple-darwin`, pacchetto `.dmg`. Intel fuori dalla prima matrice. |
| Windows | x86_64, installer `.exe` NSIS; verificare runtime WebView2 e comportamento installazione. |
| Linux | x86_64, pacchetto `.deb` per una versione Ubuntu LTS/Debian esplicitamente selezionata e verificata. AppImage come estensione, solo dopo verifica. |
| Backend | Stesso progetto Supabase e stessi servizi; nessun nuovo server desktop. |
| Link email | Conferma account, recupero password e cambio email completati nel browser sulla web app esistente. Rientro manuale e accesso desktop quando necessario. Nessun deep link nella prima versione. |
| Aggiornamenti | Prima release: aggiornamento manuale con nuovo installer; updater automatico in fase separata. |
| Dati offline | Nessuna modifica offline da sincronizzare. La modalità demo locale esistente va verificata separatamente. |
| Pubblicazione | Build e verifica locale/CI; pubblicazione e gestione di certificati solo su esplicita richiesta e con accessi autorizzati. |

Windows ARM, Linux ARM, app store, notifiche native, database locale e deep link sono fuori dal primo rilascio. Le piattaforme sopra sono obiettivi di lavoro, non compatibilità già dimostrata.

## 2. Stato del repository osservato

- `package.json`: React 19, Vite 7, Node `>=22 <25`, versione applicazione `4.0.0`; sono presenti lint, Vitest, test DB e Playwright. Non è configurato Tauri.
- `vite.config.js`: `base: '/soldi-sotto/'`; `postbuild` copia `dist/index.html` in `dist/404.html` per il deploy web.
- `src/main.jsx`: `RouterProvider` riceve il basename letterale `/soldi-sotto`. `src/router/RouterProvider.jsx` usa `window.location`, `history.pushState` e `popstate`; `src/router/AppRouter.jsx` applica rotte e regole di accesso.
- `src/services/authService.js`: `appUrl()` deriva gli URL per `dashboard`, `reset-password` e `profile` dall'origine corrente e da `BASE_URL`. `src/utils/supabaseClient.js` configura sessione persistente, rilevamento della sessione nell'URL e flow `implicit`.
- `src/context/AuthProvider.jsx`: dopo registrazione senza sessione conserva soltanto l'email pendente. `refreshCurrentUser()` non autentica un utente pendente: dopo conferma nel browser servirà accedere nella finestra desktop. Verificare i percorsi UI reali per offrire un ritorno chiaro al login.
- `supabase/templates/` usa `{{ .ConfirmationURL }}`. `SUPABASE.md` documenta URL consentiti e template web; le impostazioni remote effettive non sono state lette.
- `src/utils/accountExport.js` e `src/utils/analyticsExport.js` scaricano Blob tramite anchor; `src/utils/pdfUtils.jsx` usa `doc.save()`. `src/components/Profile/RestoreBackupSheet.jsx` usa un file input, con limite 10 MiB e validazione dell'account. Il funzionamento in ogni WebView è da verificare.
- `src/utils/storage.js` e i provider demo utilizzano storage locale; Supabase persiste la sessione nella WebView. Non assumere che storage di browser, PWA e app desktop sia condiviso.
- `index.html` contiene una CSP e il manifest PWA; `src/utils/installPrompt.js` gestisce il prompt PWA. `src/utils/errorReporting.js` può inviare report a un endpoint facoltativo. `src/utils/notificationUtils.jsx` gestisce messaggi nell'interfaccia, non notifiche native di sistema.
- `.github/workflows/deploy.yml` esegue controlli e pubblica la web app su GitHub Pages. I test esistenti includono `tests/router.test.jsx`, `tests/authService.test.js`, `tests/authFlows.test.jsx`, `tests/profile.test.jsx`, `tests/accountExport.test.js`, `tests/pdfReport.test.js`, `tests/restoreBackupSheet.test.jsx`, `tests/csp.test.js` e `tests/e2e/app.spec.js`.

Queste osservazioni provengono dalla lettura del codice, non da esecuzioni desktop o verifiche del backend reale.

## 3. Architettura e confini

```text
macOS / Windows / Linux
└── pacchetto Tauri
    ├── finestra e WebView del sistema
    ├── asset React/Vite compilati e inclusi nel pacchetto
    └── solo gli eventuali permessi nativi strettamente necessari
         │ HTTPS / WSS
         ▼
    Supabase Auth, PostgreSQL/RLS, Realtime

Browser esterno ── HTTPS ── web app esistente / link email Supabase
```

Tauri utilizza WebKit su macOS, WebView2 su Windows e WebKitGTK su Linux: una verifica in Chromium non dimostra la compatibilità delle altre WebView. Non caricare la web app remota dentro la finestra Tauri: in produzione il frontend deve provenire dal pacchetto locale. Le pagine web di autenticazione aperte nel browser non ricevono privilegi Tauri.

Per la prima versione, usare il meccanismo di protocollo predefinito di Tauri; non introdurre un server localhost in produzione. Verificare origine, storage, navigazione, CORS e CSP effettivi su ogni piattaforma. Se una incompatibilità richiede una modifica sostanziale dell'architettura, documentarla prima di procedere.

## 4. Preparazione e prerequisiti

1. Registrare `git status --short`, versione Node/npm, OS e architettura; non eliminare o sovrascrivere modifiche presenti.
2. Leggere `package.json`, `vite.config.js`, router, servizi auth, esportazioni, CSP, test e workflow indicati sopra. Cercare eventuali nuove istruzioni di progetto e variazioni sopravvenute.
3. Eseguire la baseline dei controlli applicabili descritti nella sezione 10, annotando separatamente errori preesistenti e limiti di ambiente. Non usare dati reali nei test distruttivi.
4. Verificare i prerequisiti correnti dalle [istruzioni ufficiali Tauri](https://v2.tauri.app/start/prerequisites/): toolchain Rust stabile, strumenti Xcode su macOS, build tools e WebView2 su Windows, librerie di sviluppo WebKitGTK e dipendenze della distribuzione su Linux. L'installazione di tool di sistema e le modifiche fuori workspace devono seguire le autorizzazioni disponibili.
5. Scegliere versioni Tauri 2 e plugin compatibili tra loro al momento dell'implementazione. Usare il lockfile npm e il lockfile Cargo dell'applicazione; non aggiornare indiscriminatamente le dipendenze esistenti.
6. Per test reali di Auth usare, se disponibile e autorizzato, un progetto Supabase di staging con account e dati di prova; annotare URL e configurazione senza salvare segreti nel repository o nei log. La chiave publishable non è una chiave privilegiata: non inserire mai `service_role` o secret key nel client.

## 5. Fase A — scheletro Tauri e build separata

### Attività

1. Integrare Tauri nel repository esistente, seguendo la guida Tauri per un frontend già presente. Sono previsti `src-tauri/` e le configurazioni/Cargo necessari: verificarne i nomi con la CLI e la documentazione, senza sostituire il progetto React. Impostare un identificatore stabile dell'app sotto un namespace controllato dal progetto: concordarlo prima della distribuzione pubblica, perché cambiarlo può modificare identità e posizione dei dati.
2. Collegare `beforeDevCommand` al server Vite e `devUrl` al suo indirizzo di sviluppo; collegare `beforeBuildCommand` alla build desktop e `frontendDist` a `../dist`. Evitare chiamate ricorsive tra script npm. Esporre script npm distinti e documentati per sviluppo desktop e build desktop; lasciare invariato il significato di `npm run dev` e `npm run build` web.
3. Configurare il base path per target: web `/soldi-sotto/`, desktop un base path adatto all'origine Tauri, normalmente `/`. Evitare di indovinare il target da `NODE_ENV`; usare un'impostazione esplicita e verificabile per modalità/build desktop. Far derivare anche il basename del router dalla configurazione del target, eliminando il valore letterale solo dopo aver aggiornato e verificato i test. Controllare che `postbuild` e `404.html` restino corretti per il web e non compromettano il bundle desktop.
4. Non sostituire automaticamente il router con uno hash: il fragment è già coinvolto nei callback auth web. Provare navigazione history sull'origine Tauri, incluso reload su una rotta interna, refresh, back/forward e avvio pulito. Se il protocollo non serve il fallback SPA correttamente, implementare un adattamento solo desktop coerente con il callback scelto e dimostrare che non altera il web.
5. Configurare titolo, icona, dimensioni iniziali e minime ragionevoli, ridimensionamento e chiusura. Generare i formati di icona dai file esistenti solo se adeguati; altrimenti segnalare l'asset mancante. Controllare tema chiaro/scuro, scaling e layout.
6. Verificare che le rotte lazy-load, i font e le immagini caricati tramite `BASE_URL` siano disponibili dal pacchetto senza rete. Senza connessione la shell può aprirsi, ma non presentare le funzioni account come disponibili offline.

### Uscita dalla fase

La web app continua a usare `/soldi-sotto/`; la finestra desktop si apre senza pagina bianca, legge gli asset inclusi e permette navigazione e riavvio. Registrare build e piattaforma effettivamente provate. Uno sviluppo in browser da solo non soddisfa questa verifica.

## 6. Fase B — autenticazione senza deep link

### Comportamento richiesto

| Operazione iniziata sul desktop | Percorso previsto | Risultato atteso nel desktop |
|---|---|---|
| Registrazione con conferma email | Email → Supabase → `https://solomontaiwo.github.io/soldi-sotto/dashboard` nel browser | Dopo conferma, istruzioni per tornare all'app e accedere con email/password. La sessione browser non viene trasferita. |
| Invio/rinvio conferma | Come sopra | Stesso risultato; gestire scadenza e riinvio. |
| Password dimenticata | Email → Supabase → pagina web `reset-password`; impostare nuova password nel browser | Tornare all'app e accedere con la nuova password; gestire eventuale sessione desktop scaduta o revocata. |
| Cambio email con secure email change | Seguire entrambe le conferme richieste dalla configurazione Supabase, con ritorno alla pagina web `profile` | Tornare al desktop, aggiornare lo stato o accedere nuovamente se necessario. Non considerare completato il cambio prima delle conferme previste. |
| Login/logout ordinario | Nella finestra desktop mediante servizi Supabase esistenti | Sessione persistente nell'app; logout locale senza cancellare la sessione del browser. |

L'URL pubblico indicato è quello dichiarato nel progetto, non una verifica della sua disponibilità attuale. Prima dell'implementazione confermare che web app, template pubblicati e allowlist di Supabase corrispondano all'ambiente scelto. Per staging usare l'URL web di staging autorizzato, non quello di produzione. Non costruire URL email dall'origine custom della WebView.

### Attività

1. Definire un'origine/base HTTPS web esplicita per i redirect generati dal desktop, validata e specifica per ambiente. È un valore pubblico, non un segreto. Prevedere fallimento chiaro se la configurazione desktop manca o non è valida; non alterare la costruzione URL della web app e non aggiungere automaticamente redirect remoti.
2. Modificare in modo circoscritto `appUrl()` o un helper equivalente per scegliere tale base solo nel runtime desktop. Testare le tre rotte e la gestione della slash finale. Non alterare il `flowType` web o la gestione del fragment senza un'esigenza dimostrata.
3. Adeguare testi/azioni desktop in italiano e inglese. Nel caso pendente, `refreshCurrentUser()` non è sufficiente a creare una sessione: offrire esplicitamente un percorso al login dopo la conferma, senza promettere accesso automatico. Se l'utente ha una sessione reale verificare anche il refresh del profilo. Registrare le differenze nel flusso di cambio email.
4. I link nelle email si aprono normalmente tramite il client di posta/browser predefinito. Se l'interfaccia desktop deve aprire URL esterni, usare solo un meccanismo Tauri appropriato, con allowlist di destinazioni HTTPS e privilegi minimi; non navigare la finestra privilegiata verso contenuti remoti. Non aggiungere il plugin opener se non serve a un percorso reale.
5. Integrare i test esistenti `tests/authService.test.js`, `tests/authFlows.test.jsx` e, se pertinente, `tests/profile.test.jsx` con casi web/desktop, base malformata, registrazione pendente e redirect. Non creare file di test nuovi.
6. Provare con staging: registrazione, link scaduto, reinvio, accesso, uscita, riavvio, reset e cambio email. Controllare cosa succede a entrambe le sessioni browser/desktop; evitare di affermare che la revoca avvenga immediatamente o in un determinato modo senza verifica.

**Sicurezza:** non passare token dalla pagina web all'app tramite query, log o deep link. La pagina di conferma può creare una sessione nel browser: usare un browser/dispositivo affidabile, verificare il comportamento su staging e spiegare all'utente come uscire dalla sessione web quando opportuno. Deep link, PKCE e relativo modello di minacce richiedono una fase progettuale autonoma.

### Uscita dalla fase

Tutti i percorsi email funzionano da un'installazione desktop con account di prova, senza dipendere dalla condivisione dello storage. Eventuali configurazioni remote richieste devono essere elencate come attività manuali e non applicate senza autorizzazione.

## 7. Fase C — file, sessioni, rete e interfaccia

### Esportazione e importazione

1. Provare nella WebView di **ogni** piattaforma l'export backup JSON dal profilo, CSV e PDF sia da Analytics sia dal profilo, e l'import del backup tramite file picker. Verificare file effettivamente creato, nome, contenuto, caratteri accentati, dimensione e possibilità di aprirlo; un toast di successo non è prova del salvataggio.
2. Se tutti i meccanismi browser esistenti funzionano, mantenerli. Se anche uno non è affidabile, introdurre un piccolo adattatore desktop condiviso per il salvataggio: dialogo di sistema, scrittura del solo percorso esplicitamente scelto, e distinzione fra successo, annullamento ed errore. Conservare il comportamento web esistente.
3. Se servono plugin dialog/fs, installare solo quelli necessari, consultare le versioni correnti e limitare comandi e scope alla finestra e ai file selezionati. Non concedere accesso generale al filesystem; verificare anche scope dinamici, annullamento e permessi negati. Non scrivere file temporanei contenenti dati finanziari senza motivazione e gestione del ciclo di vita.
4. Per PDF, mantenere `createPDFReport()` e il modello esistente; qualora serva l'adattatore, generare i byte dal documento e salvarli senza cambiare contenuto/nome pubblico. Propagare correttamente errori e annullamento fino alle UI in `TransactionAnalytics.jsx`, `ProfileSheets.jsx` e `Profile.jsx`: non mostrare successo se l'utente annulla o la scrittura fallisce.
5. Per restore mantenere validazione, vincolo dell'account, limite 10 MiB e semantica transazionale attuale. Usare solo backup e account di prova, perché il ripristino modifica dati remoti. Se la WebView supporta il file input non aggiungere permessi nativi superflui.
6. Aggiornare solo i test esistenti pertinenti, inclusi `accountExport`, `pdfReport`, `restoreBackupSheet` e `profile`; controllare anche i chiamanti e il comportamento di annullamento.

### Persistenza e sincronizzazione

- Verificare login, chiusura completa e riapertura dell'app, rinnovo sessione, logout e secondo account. Non leggere né esportare token nei log. Verificare separazione dello storage rispetto al browser e cosa accade reinstallando o aggiornando, senza promettere conservazione alla disinstallazione.
- Testare transazioni, budget, ricorrenze e preferenze con account di prova: modifica da desktop e controllo su web, poi direzione inversa; verificare riconnessione e Realtime. RLS continua a essere il confine di autorizzazione. Non duplicare logica di persistenza nel contenitore.
- Verificare comportamento senza rete all'avvio e dopo disconnessione: messaggi comprensibili, nessun falso successo o perdita silenziosa. Documentare precisamente cosa funziona in demo; non spacciare cache, shell locale o dati demo per sincronizzazione offline.
- Verificare layout, resize, zoom/scaling, tastiera, focus, contrasto, lingue, tema e schermate di errore. Nascondere l'eventuale invito a installare la PWA nell'app desktop mantenendo invariato il web. Nessuna promessa di notifiche native se non implementate.

### Uscita dalla fase

Tutte le funzionalità essenziali passano sulla matrice effettivamente disponibile; difetti e piattaforme mancanti restano espliciti e bloccano la dichiarazione di supporto corrispondente.

## 8. Fase D — sicurezza e configurazione

1. Confrontare la CSP HTML esistente con quella specifica di Tauri, tenendo conto che entrambe possono applicarsi. Configurare esplicitamente la CSP Tauri secondo la documentazione, permettendo solo risorse locali e connessioni necessarie a Supabase, Realtime e all'eventuale endpoint di error reporting autorizzato. Gli indirizzi e i protocolli IPC di Tauri variano secondo la piattaforma: verificarli in runtime. Non disattivare CSP né aggiungere wildcard o `unsafe-eval` per aggirare errori senza analisi.
2. Usare capability Tauri limitate alla finestra principale e soli permessi effettivamente richiesti. Nessun accesso shell/processo, filesystem ampio, contenuti remoti privilegiati o plugin localhost di default. Validare ogni URL esterno prima dell'apertura.
3. Verificare eventuali errori CORS sul progetto Supabase con l'origine reale della WebView e i metodi usati. Non disattivare controlli o usare un proxy privilegiato come scorciatoia; documentare e risolvere la causa specifica.
4. I valori `VITE_*` inclusi nella build sono leggibili nell'app distribuita: solo URL, publishable key e configurazioni pubbliche. Tenere certificati e chiavi private fuori repository, output e log.
5. La sessione Supabase corrente è persistita nello storage della WebView: non dichiararla cifrata o protetta dal portachiavi di sistema. Valutare separatamente hardening dello storage in base al modello di minaccia, senza cambiare il contratto di sessione in questa fase.
6. Rivedere messaggi e log di errore per escludere password, token, URL completi di callback e dati finanziari. Aggiornare `tests/csp.test.js` e gli altri test esistenti solo dove pertinente.

## 9. Fase E — pacchetti, firma e release

### Build e distribuzione

- **macOS:** compilare per `aarch64-apple-darwin` su ambiente macOS compatibile e produrre `.app`/`.dmg`. Per distribuzione diretta affidabile predisporre Developer ID, firma e notarizzazione Apple, verificandole sul file scaricato. Una build locale/ad hoc può servire a prove interne ma non equivale a una release pubblica notarizzata. L'account e i certificati richiedono attività manuali del proprietario.
- **Windows x86_64:** compilare e verificare installer NSIS su Windows; indicare se e come viene installato WebView2 quando assente. Provare installazione, avvio, aggiornamento e disinstallazione. La firma richiede credenziali/certificato; SmartScreen può comunque mostrare avvisi finché non si costruisce reputazione.
- **Linux x86_64:** scegliere e registrare una release Ubuntu LTS/Debian precisa, compilare `.deb`, verificare le dipendenze WebKitGTK e installare su ambiente pulito compatibile. Una singola prova non dimostra compatibilità con tutte le distribuzioni. Se viene aggiunto AppImage, provarlo indipendentemente e documentare eventuali requisiti del sistema.
- Conservare identificatore, nome prodotto e politica di versione coerenti tra release. Definire come allineare versione npm, Tauri e Cargo, rispettando i formati delle piattaforme. L'aggiornamento deve mantenere dati e sessioni nei limiti verificati e non sovrascrivere dati con versioni incompatibili.

### CI e rilascio

1. Mantenere `.github/workflows/deploy.yml` e il deploy web funzionanti. Proporre un workflow desktop separato, a esecuzione manuale o su trigger di release esplicitamente definito: una matrice macOS ARM, Windows x64 e Linux x64 costruisce gli artefatti senza pubblicarli automaticamente.
2. Fissare le versioni delle action secondo la convenzione attuale del repository, con permessi minimi (`contents: read` per build). Inserire le sole configurazioni pubbliche del client e i segreti di firma esclusivamente nello store CI autorizzato. La build di produzione deve fallire chiaramente se mancano i valori richiesti: non distribuire gli URL demo di fallback del workflow di qualità.
3. Salvare artefatti CI per revisione; controllare architettura, versione e contenuto, e calcolare checksum SHA-256. Firmare e notarizzare dove previsto. La creazione di una release pubblica, il caricamento pubblico e la pubblicazione di checksum richiedono richiesta esplicita separata.
4. Documentare installazione, requisiti, versione OS effettivamente testata, procedura di aggiornamento manuale, disinstallazione e limiti noti. Non promettere che la disinstallazione rimuova o conservi dati locali senza averlo verificato.
5. Per l'updater automatico futuro, definire endpoint HTTPS, esperienza di consenso, versionamento, rollback e distribuzione per OS; firmare gli aggiornamenti con chiave dedicata, custodita e recuperabile, diversa dai certificati di firma del sistema operativo. Non abilitarlo finché il ciclo di rilascio non è stato provato end-to-end. [Updater Tauri](https://v2.tauri.app/plugin/updater/).

## 10. Verifiche e criteri di accettazione

### Baseline e regressione web

Eseguire, secondo prerequisiti disponibili, prima e dopo la modifica:

```bash
npm run lint
npm run test:coverage
npm run test:db
npm run build
npm run check:bundle
npm run test:e2e
```

Usare valori di configurazione pubblici e ambiente di test appropriati. `npm run test:all` include anche `npm audit --omit=dev --audit-level=high`: eseguirlo se rete e policy lo consentono, distinguendo vulnerabilità da errori di rete o registro. Playwright può richiedere browser e dipendenze già installati: segnalare se non disponibili. Non creare nuovi file di test; estendere i file esistenti per rami introdotti e mantenere i controlli di copertura richiesti.

Verificare che build e deploy web conservino base path, rotte, asset, login e PWA. Se si modifica una dipendenza, controllare lockfile e sicurezza con gli strumenti disponibili senza stampare credenziali.

### Matrice minima per ogni pacchetto installato

Registrare OS/versione/architettura, tipo di pacchetto, versione app, esito e prove per ciascuna riga:

- Installazione in ambiente pulito, avvio dal sistema e riavvio senza Vite.
- UI, font, immagini, icona, resize, navigazione, back/forward, reload rotta interna, tema e lingue.
- Registrazione con conferma nel browser e login desktop; login, persistenza, logout, password dimenticata e cambio email.
- Lettura/scrittura transazioni, budget, ricorrenze e preferenze; sincronizzazione desktop ↔ web e riconnessione.
- Backup JSON, export CSV/PDF, import backup valido, annullato, errato e di altro account; verificare il contenuto dei file.
- Avvio e uso con rete assente/interrotta, messaggi di errore e successiva riconnessione.
- Upgrade da versione precedente e disinstallazione secondo quanto dichiarato; firma/notarizzazione quando disponibili.

Le verifiche automatiche del frontend non sostituiscono quelle delle WebView reali e degli installer. La documentazione Tauri distingue il test via WebDriver e il supporto specifico su macOS: scegliere strumenti compatibili con le versioni in uso; se l'automazione richiede nuove dipendenze di test, mantenere la verifica manuale nel rispetto dei vincoli di progetto. [Test Tauri](https://v2.tauri.app/develop/tests/).

### Definizione di completamento

La realizzazione è completata quando:

1. Il web esistente passa i controlli pertinenti senza regressioni dimostrate.
2. I tre pacchetti obiettivo sono generati e installati/provati su sistemi e architetture dichiarati; se uno manca, indicare che la piattaforma non è ancora verificata.
3. I flussi auth, dati, export/import e riconnessione hanno superato la matrice sopra con account di prova.
4. CSP, capability, configurazione di build e assenza di chiavi privilegiate sono state verificate.
5. Sono disponibili istruzioni di installazione/aggiornamento e risultati delle prove; eventuali firme, notarizzazione, release pubblica e configurazioni Supabase non autorizzate sono chiaramente indicate come attività manuali aperte.

## 11. Rischi e decisioni da confermare prima del rilascio pubblico

| Tema | Rischio o decisione | Come trattarlo |
|---|---|---|
| Callback auth | Link apre il browser e crea una sessione separata | Spiegare il ritorno al login desktop; verificare template e allowlist reali; non trasferire token. |
| Browser/WebView | Download, History API e storage possono differire | Provare ogni WebView; adattare solo il percorso che fallisce. |
| Dati sensibili | Backup e sessioni sono dati privati | Salvare solo su scelta utente, evitare log sensibili, descrivere i limiti dello storage senza promettere cifratura. |
| Identità desktop | Modificare identifier o origine può cambiare storage | Scegliere identità stabile e provare aggiornamento/migrazione prima della release. |
| Disponibilità web | I flussi email dipendono dalla web app pubblicata | Trattare il funzionamento della web app e dei redirect come prerequisito operativo. |
| Distribuzione | Firma/notarizzazione e reputazione dipendono da account e certificati | Preparare tutto il verificabile e segnalare ciò che richiede il proprietario. |
| Linux | Distribuzioni e versioni WebKitGTK differiscono | Dichiarare solo la distribuzione/versione verificata; ampliare la matrice successivamente. |
| Compatibilità OS | Versioni minime non ancora scelte | Definirle dopo verifica di Tauri e dipendenze, documentando i sistemi realmente provati. |
| Upgrade | Installer e storage possono comportarsi diversamente | Provare aggiornamento tra due versioni reali su ciascun OS. |

## 12. Documentazione tecnica di riferimento

Consultare nuovamente le versioni correnti prima dell'implementazione:

- [Configurazione frontend Tauri](https://v2.tauri.app/start/frontend/) e [configurazione Tauri](https://v2.tauri.app/reference/config/).
- [Prerequisiti Tauri](https://v2.tauri.app/start/prerequisites/) e [versioni delle WebView](https://v2.tauri.app/reference/webview-versions/).
- [CSP Tauri](https://v2.tauri.app/security/csp/), [sicurezza Tauri](https://v2.tauri.app/security/) e [plugin filesystem](https://v2.tauri.app/plugin/file-system/).
- [URL di redirect Supabase](https://supabase.com/docs/guides/auth/redirect-urls) e [gestione sessioni Supabase](https://supabase.com/docs/guides/auth/sessions).
- [Distribuzione Tauri](https://v2.tauri.app/distribute/), [firma macOS](https://v2.tauri.app/distribute/sign/macos/), [firma Windows](https://v2.tauri.app/distribute/sign/windows/) e [pipeline GitHub](https://v2.tauri.app/distribute/pipelines/github/).
