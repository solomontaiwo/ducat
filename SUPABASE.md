# Soldi Sotto su Supabase

Guida per configurare il progetto Supabase, spostare account e dati da Firebase e mettere in produzione la nuova versione.

Lo schema completo (tabelle, regole di accesso RLS, trigger, funzioni) è in `supabase/migrations/20261010000000_initial_schema.sql` ed è verificato da `npm run test:db`.

## 1. Crea il progetto

1. Su [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Regione: **Central EU (Frankfurt)**, così i dati restano nell'Unione europea (lo dice anche la pagina Privacy dell'app).
3. Salva la password del database in un password manager.

Nel piano Free il progetto va in pausa dopo 7 giorni senza alcuna richiesta. Con l'uso quotidiano non succede; se capita, si riattiva dalla dashboard.

## 2. Crea lo schema

**SQL Editor → New query**, incolla tutto il file `supabase/migrations/20261010000000_initial_schema.sql` e premi **Run**.

In alternativa da terminale:

```bash
npx supabase login
npx supabase link --project-ref <REF_DEL_PROGETTO>
npx supabase db push
```

Controllo: in **Table Editor** devono esserci `profiles`, `transactions`, `recurring`, `budgets`, `preferences`, tutte con l'etichetta RLS attiva.

## 3. Autenticazione

**Authentication → Sign In / Providers → Email**

- Email provider: attivo
- **Confirm email**: attivo (senza conferma l'account non vede i dati)
- **Secure email change**: attivo
- Minimum password length: **8**

**Authentication → URL Configuration**

- Site URL: `https://solomontaiwo.github.io/soldi-sotto/`
- Redirect URLs:
  - `https://solomontaiwo.github.io/soldi-sotto/**`
  - `http://localhost:5173/soldi-sotto/**` (sviluppo locale)

**Authentication → Emails → SMTP Settings**

Il servizio email incluso consegna solo agli indirizzi del team del progetto e con un limite molto basso: per gli utenti veri serve un SMTP tuo. Vanno bene i piani gratuiti di Resend o Brevo, idealmente con un dominio tuo come mittente (es. `noreply@tuodominio.it`). Dopo averlo configurato, alza il limite in **Authentication → Rate Limits** (es. 30 email/ora).

**Authentication → Emails → Templates** (testi in italiano)

| Template | Oggetto | Corpo |
|---|---|---|
| Confirm signup | Conferma il tuo account Soldi Sotto | `<p>Ciao!</p><p>Conferma il tuo indirizzo per iniziare a usare Soldi Sotto:</p><p><a href="{{ .ConfirmationURL }}">Conferma email</a></p>` |
| Reset password | Reimposta la password di Soldi Sotto | `<p>Hai chiesto di cambiare password.</p><p><a href="{{ .ConfirmationURL }}">Scegli una nuova password</a></p><p>Se non sei stato tu, ignora questa email.</p>` |
| Change email address | Conferma il nuovo indirizzo | `<p>Conferma il cambio da {{ .Email }} a {{ .NewEmail }}:</p><p><a href="{{ .ConfirmationURL }}">Conferma</a></p>` |

## 4. Chiavi

**Project Settings → API Keys**

- **Publishable key** (`sb_publishable_…`, o la vecchia `anon`): va nell'app. È pubblica per natura; i dati sono protetti dalle regole RLS.
- **Secret key** (`sb_secret_…`, o la vecchia `service_role`): serve **solo** allo script di migrazione. Mai nell'app, mai su GitHub.

File `.env` locale:

```
VITE_SUPABASE_URL=https://<REF>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

GitHub → **Settings → Secrets and variables → Actions**: crea i secret `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` con gli stessi valori. Facoltativo: variabile `VITE_ENABLE_ACCOUNT_DELETION=true` per mostrare "Elimina account" (ora funziona con la funzione SQL `delete_my_account`, non serve più la Cloud Function).

## 5. Prova in locale (branch `dev`)

```bash
git checkout dev && npm install && npm run dev
```

Registra un account di prova, conferma l'email, aggiungi movimenti, una ricorrenza e un budget, cambia il giorno di inizio mese. Apri l'app in un secondo browser con lo stesso account: le modifiche arrivano da sole (Realtime).

## 6. Sposta account e dati da Firebase

Da fare subito prima del passaggio in produzione. Le password restano valide: Supabase accetta gli hash scrypt di Firebase.

1. **Parametri dell'hash**: Firebase Console → Authentication → Users → menu ⋮ → **Password hash parameters**. Annota `base64_signer_key`, `base64_salt_separator`, `rounds`, `mem_cost`.
2. **Esporta gli utenti**:
   ```bash
   npx firebase-tools auth:export scripts/firebase-to-supabase/users.json --format=json --project soldi-sotto
   ```
3. **Chiave di servizio Firebase**: Project settings → Service accounts → **Generate new private key**, salvala come `scripts/firebase-to-supabase/service-account.json` (i `.json` di quella cartella sono esclusi da git).
4. **Esegui**:
   ```bash
   cd scripts/firebase-to-supabase
   npm install
   export SUPABASE_URL=https://<REF>.supabase.co
   export SUPABASE_SECRET_KEY=sb_secret_...
   export GOOGLE_APPLICATION_CREDENTIALS=$PWD/service-account.json
   export FIREBASE_USERS_FILE=$PWD/users.json
   export FIREBASE_HASH_SIGNER_KEY='...'
   export FIREBASE_HASH_SALT_SEPARATOR='...'
   export FIREBASE_HASH_ROUNDS=8
   export FIREBASE_HASH_MEM_COST=14
   npm run migrate:dry   # legge e conta, non scrive
   npm run migrate
   ```
5. Alla fine ogni account mostra `check … ok` (movimenti copiati / movimenti in Firebase). Accedi con la tua password di sempre e controlla saldo, ricorrenze, budget e preferenze.

Lo script si può rilanciare: aggiunge solo ciò che manca (account per email, movimenti per id). Le modifiche o cancellazioni fatte su Firebase dopo la prima copia non vengono riportate, quindi dopo la migrazione non usare più la versione vecchia. Se i parametri dell'hash mancano, gli account vengono creati senza password e ognuno dovrà usare "Password dimenticata?".

## 7. Passa in produzione

1. Controlla che i due secret GitHub siano impostati (punto 4): senza, l'app pubblicata non parte.
2. Porta `dev` su `main`:
   ```bash
   git checkout main
   git merge --ff-only dev
   git push origin main
   ```
3. Attendi il workflow "Quality and deploy" e apri `https://solomontaiwo.github.io/soldi-sotto/`: accesso, movimenti, email di recupero password.

## 8. Dopo il passaggio

- **Rollback**: `git revert` del merge su `main` ripubblica la versione Firebase. I dati inseriti su Supabase nel frattempo non tornano su Firebase.
- Tieni il progetto Firebase così com'è per circa un mese come riserva, poi eliminalo e cancella i secret `VITE_FIREBASE_*` da GitHub.
- Backup: il piano Free non offre backup scaricabili. Oltre al "Backup completo" nel profilo dell'app, ogni tanto puoi esportare il database con `pg_dump` usando la connection string di **Project Settings → Database** (es. `pg_dump "$DATABASE_URL" --data-only --schema=public -f backup.sql`).
