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

## Quality and security setup

The repository includes `firestore.rules` and `firestore.indexes.json`. Deploy them before using the app in production:

```bash
npx firebase-tools login
npx firebase-tools use YOUR_FIREBASE_PROJECT_ID
npx firebase-tools deploy --only firestore:rules,firestore:indexes
```

The rules limit financial data to verified users and to the owner of each transaction. The app signs in with email only, so the legacy `usernames` collection is deliberately inaccessible. The repository also includes Firestore emulator tests, unit/component tests, Playwright E2E accessibility checks, bundle budgets and a trusted callable Function for complete account deletion.

Run the full local quality pipeline with Node 24 and Java 21:

```bash
npm ci
nvm exec 22 npm --prefix functions ci
npm run lint
npm test
npm run test:rules
npm run build
npm run check:bundle
npm run test:e2e
```

In Firebase Console, complete these manual safeguards:

1. Enable a strong password policy and email enumeration protection in **Authentication → Settings**.
2. Register and enforce **App Check** for Firestore and Cloud Functions after distributing the configured client.
3. In Google Cloud Console, allow only the production site and local development origins in the Firebase API key's HTTP referrer restrictions.
4. Confirm that the email action sender/domain is configured so verification emails can be delivered.

For the required deployment order, backups, schema-v2 migration, Cloud Function, App Check, security headers, GitHub Secrets and release checklist, follow [CONFIGURAZIONE_MANUALE.md](CONFIGURAZIONE_MANUALE.md). The original findings and acceptance criteria remain in [AUDIT_COMPLETO.md](AUDIT_COMPLETO.md).

## Contributions

Since this is one of my first projects in React, any suggestions or contributions are welcome! If you'd like to contribute, feel free to open a pull request or report any issues via the issues tab.

## Contact

For questions or suggestions, you can contact me via email: [solomon.taiwo@studenti.polito.it](mailto:solomon.taiwo@studenti.polito.it).

---
