# Ambiente web di sviluppo

Il branch `dev` pubblica su `https://dev.ducatapp.com/` con GitHub Actions dopo i controlli del job `quality`. Il sito usa il Worker `ducat-dev` e un progetto Supabase dedicato. Le pull request eseguono i controlli, mentre il deploy parte su push a `dev` o quando avvii manualmente il workflow su `dev`. Una build di sviluppo mostra il badge **DEV** e invia `X-Robots-Tag: noindex`. L'URL è pubblico: `noindex` è un'indicazione per i motori di ricerca, non un controllo degli accessi.

## 1. Supabase

1. Nella [dashboard Supabase](https://supabase.com/dashboard), crea un progetto `ducat-dev`. Conserva la password del database in un gestore di password. Scegli un progetto nuovo e usa soltanto account e dati di prova. Il [piano Free](https://supabase.com/docs/guides/platform/billing-on-supabase) consente due progetti gratuiti attivi in base alla quota disponibile. I progetti gratuiti poco attivi [possono essere sospesi](https://supabase.com/docs/guides/platform/free-project-pausing).
2. Dal repository aggiornato, installa lo schema nel nuovo progetto con la CLI. Sostituisci `<REF_DEV>` con il riferimento del nuovo progetto. Prima del push delle migrazioni controlla che il riferimento e le migrazioni mostrate dal dry run siano quelli previsti.

   ```bash
   supabase_dev_ref='sostituisci-con-il-riferimento-del-progetto-dev'
   npx supabase login
   npx supabase link --project-ref "$supabase_dev_ref"
   npx supabase db push --remote --dry-run
   npx supabase db push --remote
   npx supabase migration list --remote
   ```

   Le migrazioni in `supabase/migrations/` configurano schema, regole di accesso e pubblicazione Realtime. Ripeti il controllo e l'applicazione delle migrazioni su `dev` quando cambia lo schema, prima del push che pubblica il frontend. Il workflow web non applica migrazioni. Il collegamento CLI resta locale: controlla sempre il progetto di destinazione prima di altri comandi sul database. [Guida alle migrazioni per ambiente](https://supabase.com/docs/guides/deployment/managing-environments)

3. Nel progetto **ducat-dev**, apri **Authentication → URL Configuration**. Imposta **Site URL** a `https://dev.ducatapp.com/` e aggiungi `https://dev.ducatapp.com/**` in **Redirect URLs**. Aggiungi `http://localhost:5173/**` solo se vuoi usare lo stesso backend anche da Vite in locale. [Configurazione dei redirect](https://supabase.com/docs/guides/auth/redirect-urls)
4. In **Authentication**, abilita il provider Email, la conferma dell'indirizzo e il cambio email sicuro. Per provare le email usa un indirizzo ammesso dal servizio incluso oppure configura un SMTP di test in **Authentication → Emails → SMTP Settings**. Il servizio incluso limita destinatari e invii. Puoi copiare i tre template da `supabase/templates/`, come descritto nella [guida Supabase del progetto](../SUPABASE.md). [SMTP di Supabase](https://supabase.com/docs/guides/auth/auth-smtp)
5. Copia il **Project URL** (`https://<REF_DEV>.supabase.co`) e la **Publishable key** (`sb_publishable_…`) del nuovo progetto dai dettagli di connessione o da **Settings → API Keys**. Il frontend usa solo queste due impostazioni pubbliche.

## 2. Cloudflare

1. Apri l'account che gestisce la zona `ducatapp.com` e copia il suo **Account ID**. Verifica che `dev.ducatapp.com` sia libero. Il primo deploy GitHub Actions può creare `ducat-dev` se il token ha i permessi di creazione. Se il Worker è già stato creato nella dashboard, usa i permessi di deploy sul Worker esistente.
2. Crea un API token per GitHub Actions con accesso per pubblicare Workers, partendo dal modello **Edit Cloudflare Workers**. Limitalo all'account della zona e, se disponibile per il token, al Worker `ducat-dev` una volta creato. Il dominio si configura dalla dashboard, quindi il token del workflow non deve gestire DNS e Custom Domains. Copia il token quando viene mostrato. [Autenticazione di GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/) · [Permessi Workers](https://developers.cloudflare.com/workers/authorization/workers/)
3. Controlla il Worker di produzione `ducat` in **Settings → Build**. Se l'integrazione Git crea preview da branch non di produzione, escludi `dev` o disabilita quelle preview se non le usi, così il branch non genera anche una build con la configurazione del Worker di produzione. Lascia `main` come branch di produzione. Per `ducat-dev` GitHub Actions è il sistema di deploy, quindi non serve collegare il Worker dev a un secondo trigger Git di Cloudflare.

## 3. GitHub Actions

1. Nel repository GitHub apri **Settings → Environments → New environment** e crea `dev`. In **Deployment branches and tags** scegli **Selected branches and tags** e aggiungi una regola di tipo **Branch** per `dev`. [Environment GitHub](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
2. Nello stesso environment aggiungi i valori seguenti in **Environment variables** e **Environment secrets**. Usa i valori Supabase del nuovo progetto.

   | Nome | Dove | Valore |
   |---|---|---|
   | `DEV_SUPABASE_URL` | Variable | Project URL di `ducat-dev` |
   | `DEV_SUPABASE_PUBLISHABLE_KEY` | Variable | Publishable key di `ducat-dev` |
   | `DEV_CLOUDFLARE_ACCOUNT_ID` | Variable | Account ID Cloudflare |
   | `DEV_CLOUDFLARE_API_TOKEN` | Secret | API token Cloudflare |

3. Pubblica su `dev` il commit che contiene il workflow aggiornato. Se le modifiche sono ancora solo locali sul branch `dev`, puoi pubblicarle così dopo aver verificato il diff:

   ```bash
   git status --short --branch
   git add .github/workflows/deploy.yml .github/workflows/desktop.yml README.md docs/DEV_ENVIRONMENT.md src/App.jsx wrangler.dev.jsonc
   git commit -m "feat(ci): deploy dev web environment"
   git push origin dev
   ```

   Il primo push avvia **Quality and deploy**. Per riprovare dopo una modifica alle impostazioni, apri **Actions → Quality and deploy → Run workflow** e seleziona `dev`.
4. Dopo il primo deploy, in Cloudflare apri **Workers & Pages → ducat-dev → Settings → Domains & Routes → Add → Custom Domain**. Inserisci `dev.ducatapp.com` e attendi DNS e certificato. Le URL `workers.dev` e le preview del Worker sono disabilitate dalla configurazione del progetto. [Domini personalizzati Cloudflare](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)

## 4. Verifica e flusso di lavoro

1. In GitHub, verifica che `quality` e **Deploy dev to Cloudflare** siano verdi e che per il push su `dev` non parta **Desktop builds**.
2. Apri `https://dev.ducatapp.com/` e verifica il badge **DEV**. Ricarica `https://dev.ducatapp.com/reset-password` per verificare il fallback delle rotte web. Nel pannello Network del browser controlla che le richieste a Supabase puntino a `<REF_DEV>.supabase.co`.
3. Registra un account di prova, conferma l'indirizzo via email, accedi, crea un movimento e verifica che appaia in una seconda sessione. Prova anche il reset password. Controlla che gli utenti e i movimenti di prova compaiano nel progetto `ducat-dev`.
4. Porta le modifiche verificate da `dev` verso `main` con una pull request. Dopo gli aggiornamenti diretti a `main`, compresi i commit automatici di versione, integra di nuovo `main` in `dev` per mantenere allineati i branch.
