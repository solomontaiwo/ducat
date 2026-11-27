# Ducat su Supabase

Guida per configurare un progetto Supabase per Ducat: produzione (`ducatapp.com`) o un ambiente nuovo. Per l'ambiente di sviluppo (`dev.ducatapp.com`) vedi anche [DEV_ENVIRONMENT.md](DEV_ENVIRONMENT.md).

Lo schema completo (tabelle, regole di accesso RLS, trigger, funzioni) è in `supabase/migrations/` ed è verificato da `npm run test:db`.

## 1. Crea il progetto

1. Su [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Regione: **Central EU (Frankfurt)**, così i dati restano nell'Unione europea (lo dice anche la pagina Privacy dell'app).
3. Salva la password del database in un password manager.

Nel piano Free il progetto va in pausa dopo 7 giorni senza alcuna richiesta. Con l'uso quotidiano non succede; se capita, si riattiva dalla dashboard.

## 2. Applica le migrazioni

Da terminale, così Supabase registra anche le migrazioni applicate:

```bash
npx supabase login
npx supabase link --project-ref <REF_DEL_PROGETTO>
npx supabase db push --dry-run
npx supabase db push
```

Le migrazioni vanno applicate nell'ordine del nome del file:

| File | Contenuto |
|---|---|
| `20261010000000_initial_schema.sql` | tabelle, RLS, trigger, Realtime, funzione `delete_my_account` |
| `20261011000000_audit_reliability.sql` | salvataggio di movimento e ricorrenza nella stessa transazione, avanzamento atomico delle scadenze, aggiornamento delle preferenze per campi, lettura e ripristino del backup completo |

In alternativa al terminale: **SQL Editor → New query**, esegui i file uno alla volta nell'ordine. Questa modalità crea lo schema ma non registra le migrazioni nella cronologia usata dalla CLI e da Supabase Preview. Non rieseguire solo lo schema iniziale dopo la seconda migrazione: sostituirebbe la funzione di eliminazione con la versione precedente.

La migrazione iniziale può essere rieseguita su uno schema equivalente: conserva tabelle e dati esistenti, aggiorna funzioni e trigger e aggiunge solo indici, policy e associazioni Realtime mancanti. Le modifiche successive allo schema vanno in nuove migrazioni.

Controllo: in **Table Editor** devono esserci `profiles`, `transactions`, `recurring`, `budgets`, `preferences`, tutte con l'etichetta RLS attiva.

### Supabase Preview: `relation "profiles" already exists`

Questo errore indica che Preview sta applicando la migrazione iniziale a un database in cui `profiles` esiste già. Può succedere quando lo schema è stato creato dal SQL Editor e la cronologia delle migrazioni non è allineata.

Se il progetto è stato inizializzato manualmente, verifica che tutto lo schema corrisponda ai file SQL (non solo le cinque tabelle: anche colonne, vincoli, indici, funzioni, trigger, policy RLS e Realtime), poi allinea la cronologia:

```bash
npx supabase migration list
npx supabase migration repair 20261010000000 --status applied
npx supabase migration list
```

`migration repair` registra la migrazione come applicata senza eseguirne il SQL. Usalo solo se lo schema completo è già presente e la versione manca dalla cronologia remota. Vedi la [documentazione Supabase sulla riparazione delle migrazioni](https://supabase.com/docs/reference/cli/supabase-migration-repair).

## 3. Autenticazione

**Authentication → Sign In / Providers → Email**

- Email provider: attivo
- **Confirm email**: attivo (senza conferma l'account non vede i dati)
- **Secure email change**: attivo
- Minimum password length: **8**

**Authentication → URL Configuration**

- Site URL: `https://ducatapp.com/`
- Redirect URLs:
  - `https://ducatapp.com/**`
  - `http://localhost:5173/**` (sviluppo locale, facoltativo)

L'app desktop e quella iOS usano gli stessi link web (`VITE_DESKTOP_WEB_URL`, predefinito `https://ducatapp.com/`).

**Authentication → Emails → SMTP Settings**

Il servizio email incluso consegna solo agli indirizzi del team del progetto e con un limite molto basso: per gli utenti veri serve un SMTP proprio (Ducat usa Resend con il sottodominio `mail.ducatapp.com`, ad esempio `noreply@mail.ducatapp.com`, così da non confliggere con Cloudflare Email Routing su `ducatapp.com`). Dopo averlo configurato, alza il limite in **Authentication → Rate Limits** (es. 30 email/ora).

**Authentication → Emails → Templates**

I modelli sono in `supabase/templates/`, in italiano e inglese: l'app salva la lingua dell'utente in `user_metadata.lang` e il modello sceglie il testo (italiano se manca). Sia il campo **Subject** sia **Message body (Source)** supportano le variabili Go di Supabase:

| Template | File | Oggetto (`Subject`) |
|---|---|---|
| Confirm signup | `confirm-signup.html` | `{{ if and .Data.lang (eq .Data.lang "en") }}Confirm your Ducat account{{ else }}Conferma il tuo account Ducat{{ end }}` |
| Reset password | `reset-password.html` | `{{ if and .Data.lang (eq .Data.lang "en") }}Reset your Ducat password{{ else }}Reimposta la password di Ducat{{ end }}` |
| Change email address | `change-email.html` | `{{ if and .Data.lang (eq .Data.lang "en") }}Confirm your new Ducat email{{ else }}Conferma il nuovo indirizzo email di Ducat{{ end }}` |

## 4. Chiavi

**Project Settings → API Keys**

- **Publishable key** (`sb_publishable_…`, o la vecchia `anon`): va nell'app. È pubblica per natura; i dati sono protetti dalle regole RLS.
- **Secret key** (`sb_secret_…`, o la vecchia `service_role`): non serve all'app. Mai nel codice, mai su GitHub.

File `.env` locale:

```
VITE_SUPABASE_URL=https://<REF>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Gli stessi due valori servono:

- su GitHub (**Settings → Secrets and variables → Actions**) come secret `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`, per le build iOS e desktop;
- su Cloudflare, nelle variabili di build del Worker `ducat` (vedi [APP_STORE_RELEASE.md](APP_STORE_RELEASE.md) §8).

"Elimina account" è attivo di default e usa la funzione SQL `delete_my_account`; `VITE_ENABLE_ACCOUNT_DELETION=false` lo nasconde.

## 5. Sicurezza e funzioni del database

- L'eliminazione dell'account richiede un'autenticazione con password negli ultimi due minuti, verificata nel database tramite il campo `amr` del JWT firmato da Supabase. La richiesta della password nel profilo esegue già questa autenticazione; il rinnovo del token da solo non basta. Vedi i [campi JWT di Supabase](https://supabase.com/docs/guides/auth/jwt-fields).
- **Ripristina backup** (profilo) accetta file JSON schemaVersion 2 fino a 10 MB, esportati dallo stesso account. Aggiunge soltanto gli ID mancanti; movimenti e ricorrenze già presenti restano invariati. Budget e preferenze vengono sostituiti solo scegliendo l'opzione dedicata. Il ripristino è una singola transazione e un tentativo ripetuto non duplica gli ID.
- Tutte le funzioni rispettano RLS e richiedono un account con email verificata.

`npm run test:db` verifica migrazioni, RLS, rollback dei salvataggi composti e del ripristino, tentativi ripetuti, date delle ricorrenze e autenticazione recente. Dopo aver applicato una migrazione, prova con un account di prova anche Realtime tra due browser e un backup con relativo ripristino.

## 6. Backup

Il piano Free non offre backup scaricabili. Oltre al "Backup completo" nel profilo dell'app, ogni tanto puoi esportare il database con `pg_dump` usando la connection string di **Project Settings → Database** (es. `pg_dump "$DATABASE_URL" --data-only --schema=public -f backup.sql`).
