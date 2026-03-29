# SoldiSotto

SoldiSotto is a web application developed in React, designed to manage personal finances. This project was created with the aim of exploring and learning the features of the React framework, also integrating Firebase for backend management.

## Features

- **Registration and Login**: Users can create an account or log in with existing credentials.
- **Add Transactions**: Easily and quickly record your income and expenses.
- **Chronological View**: View all your transactions in chronological order.
- **Statistics**: View financial statistics by day, week, month, or year.
- **PDF Generation**: Generate a PDF containing all transactions for a selected period (day, week, month, year) along with relevant statistics.

## Technologies Used

- **React**: JavaScript framework used to build the user interface.
- **Firebase**: Used as the backend for authentication and transaction data management.

## Getting Started

### Prerequisites

- Node.js installed on your machine.
- A configured Firebase account.

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/solomontaiwo/soldi-sotto.git
   ```

2. Navigate to the project directory:

   ```bash
   cd soldi-sotto
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Configure Firebase:

   - Create a project on Firebase.
   - Copy `.env.example` to `.env` at the root of the project and fill in your Firebase credentials. **Do not commit `.env`** — it is already listed in `.gitignore`.

   ```bash
   cp .env.example .env
   # then edit .env with your values
   ```

   Your `.env` should look like this (use `VITE_FIREBASE_*` prefixes — required by Vite):

   ```plaintext
   VITE_FIREBASE_API_KEY=your-api-key
   VITE_FIREBASE_AUTH_DOMAIN=your-auth-domain
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-storage-bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
   VITE_FIREBASE_APP_ID=your-app-id
   VITE_FIREBASE_MEASUREMENT_ID=your-measurement-id
   ```

   > **Note:** The Firebase web `apiKey` is not a backend secret (it is visible in the browser), but you should still manage it through environment variables rather than hardcoding it, to avoid accidental changes and keep configuration out of source control.

5. Start the application:

   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:5173`.

## Deployment on GitHub Pages

This project deploys automatically to GitHub Pages via GitHub Actions on every push to `main`.

### How CI injects environment variables

The workflow (`.github/workflows/deploy.yml`) passes the `VITE_FIREBASE_*` values as environment variables to the `npm run build` step. Vite embeds them in the bundle at build time.

**You must add the following secrets** in your GitHub repository settings under **Settings → Secrets and variables → Actions → New repository secret**:

| Secret name | Where to find the value |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase console → Project settings → Your apps |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase console → Project settings → Your apps |
| `VITE_FIREBASE_PROJECT_ID` | Firebase console → Project settings → Your apps |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase console → Project settings → Your apps |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase console → Project settings → Your apps |
| `VITE_FIREBASE_APP_ID` | Firebase console → Project settings → Your apps |
| `VITE_FIREBASE_MEASUREMENT_ID` | Firebase console → Project settings → Your apps |

Once the secrets are set, any push to `main` will trigger the workflow, build the app with the correct config, and publish the `dist/` folder to GitHub Pages.

> **Do not commit your `.env` file.** It is already excluded in `.gitignore` via `*.env`.

## Contributions

Since this is one of my first projects in React, any suggestions or contributions are welcome! If you'd like to contribute, feel free to open a pull request or report any issues via the issues tab.

## Contact

For questions or suggestions, you can contact me via email: [solomon.taiwo@studenti.polito.it](mailto:solomon.taiwo@studenti.polito.it).

---

# SoldiSotto - ITA

SoldiSotto è un'applicazione web sviluppata in React, progettata per gestire le proprie finanze personali. Questo progetto nasce con l'obiettivo di esplorare e apprendere le funzionalità del framework React, integrando anche Firebase per la gestione del backend.

## Funzionalità

- **Registrazione e Login**: Gli utenti possono creare un account o accedere con credenziali esistenti.
- **Aggiunta di Transazioni**: Registra le tue entrate e uscite in modo semplice e rapido.
- **Visualizzazione Cronologica**: Consulta tutte le tue transazioni in ordine cronologico.
- **Statistiche**: Visualizza le statistiche delle tue finanze per giorno, settimana, mese o anno.
- **Generazione di PDF**: Genera un PDF contenente tutte le transazioni per un periodo selezionato (giorno, settimana, mese, anno) insieme a statistiche rilevanti.

## Tecnologie Utilizzate

- **React**: Framework JavaScript utilizzato per costruire l'interfaccia utente.
- **Firebase**: Utilizzato come backend per l'autenticazione e la gestione dei dati delle transazioni.

## Come Iniziare

### Prerequisiti

- Node.js installato sulla tua macchina.
- Un account Firebase configurato.

### Installazione

1. Clona la repository:

   ```bash
   git clone https://github.com/solomontaiwo/soldi-sotto.git
   ```

2. Naviga nella directory del progetto:

   ```bash
   cd soldi-sotto
   ```

3. Installa le dipendenze:

   ```bash
   npm install
   ```

4. Configura Firebase:

   - Crea un progetto su Firebase.
   - Copia `.env.example` in `.env` nella radice del progetto e inserisci le tue credenziali Firebase. **Non committare `.env`** — è già incluso nel `.gitignore`.

   ```bash
   cp .env.example .env
   # poi modifica .env con i tuoi valori
   ```

   Il file `.env` deve avere questo formato (usa i prefissi `VITE_FIREBASE_*` — richiesti da Vite):

   ```plaintext
   VITE_FIREBASE_API_KEY=tuo-api-key
   VITE_FIREBASE_AUTH_DOMAIN=tuo-auth-domain
   VITE_FIREBASE_PROJECT_ID=tuo-project-id
   VITE_FIREBASE_STORAGE_BUCKET=tuo-storage-bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=tuo-messaging-sender-id
   VITE_FIREBASE_APP_ID=tuo-app-id
   VITE_FIREBASE_MEASUREMENT_ID=tuo-measurement-id
   ```

   > **Nota:** L'`apiKey` web di Firebase non è un segreto backend (è visibile nel browser), ma dovresti comunque gestirla tramite variabili d'ambiente invece di inserirla direttamente nel codice, per evitare modifiche accidentali e mantenere la configurazione fuori dal controllo versione.

5. Avvia l'applicazione:

   ```bash
   npm run dev
   ```

   L'app sarà disponibile su `http://localhost:5173`.

## Deploy su GitHub Pages

Il progetto viene deployato automaticamente su GitHub Pages tramite GitHub Actions ad ogni push su `main`.

### Come la CI inietta le variabili d'ambiente

Il workflow (`.github/workflows/deploy.yml`) passa i valori `VITE_FIREBASE_*` come variabili d'ambiente allo step `npm run build`. Vite li incorpora nel bundle al momento della build.

**Devi aggiungere i seguenti segreti** nelle impostazioni del repository GitHub sotto **Settings → Secrets and variables → Actions → New repository secret**:

| Nome del segreto | Dove trovare il valore |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase console → Impostazioni progetto → Le tue app |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase console → Impostazioni progetto → Le tue app |
| `VITE_FIREBASE_PROJECT_ID` | Firebase console → Impostazioni progetto → Le tue app |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase console → Impostazioni progetto → Le tue app |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase console → Impostazioni progetto → Le tue app |
| `VITE_FIREBASE_APP_ID` | Firebase console → Impostazioni progetto → Le tue app |
| `VITE_FIREBASE_MEASUREMENT_ID` | Firebase console → Impostazioni progetto → Le tue app |

Una volta impostati i segreti, ogni push su `main` attiverà il workflow, builderà l'app con la configurazione corretta e pubblicherà la cartella `dist/` su GitHub Pages.

> **Non committare il file `.env`.** È già escluso nel `.gitignore` tramite `*.env`.

## Contributi

Essendo uno dei miei primi progetti in React, qualsiasi suggerimento o contributo è ben accetto! Se vuoi contribuire, sentiti libero di aprire una pull request o di segnalare eventuali problemi tramite le issue.

## Contatti

Per domande o suggerimenti, puoi contattarmi via email: [solomon.taiwo@studenti.polito.it](mailto:solomon.taiwo@studenti.polito.it).
