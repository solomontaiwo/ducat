# SoldiSotto

SoldiSotto is a web application developed in React, designed to manage personal finances. This project was created with the aim of exploring and learning the features of the React framework, with Supabase (PostgreSQL, Auth and Realtime) as the backend.

## Features

- **Registration and Login**: Users can create an account or log in with existing credentials.
- **Add Transactions**: Easily and quickly record your income and expenses.
- **Chronological View**: View all your transactions in chronological order.
- **Statistics**: View financial statistics by day, week, month, or year.
- **PDF Generation**: Generate a PDF containing all transactions for a selected period (day, week, month, year) along with relevant statistics.

## Technologies Used

- **React**: JavaScript framework used to build the user interface.
- **Supabase**: authentication, PostgreSQL database protected by row level security, Realtime sync between devices.

## Getting Started

Requirements: Node.js 24 and a Supabase project (see [SUPABASE.md](SUPABASE.md) for the full setup and the move from Firebase).

```bash
git clone https://github.com/solomontaiwo/soldi-sotto.git
cd soldi-sotto
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

The app is served at `http://localhost:5173/soldi-sotto/`. Demo mode works without any backend.

The database schema, row level security policies and helper functions live in `supabase/migrations/`. The publishable key is meant to be public: access to data is enforced by the policies, not by the key.

## Deployment on GitHub Pages

Every push to `main` builds and publishes the app through `.github/workflows/deploy.yml`. Add these repository secrets under **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → publishable key |

Optional repository variable: `VITE_ENABLE_ACCOUNT_DELETION=true` shows account deletion in the profile.

## Quality checks

```bash
npm run lint
npm run test:coverage   # unit and component tests
npm run test:db         # schema and row level security, on an in-process PostgreSQL (PGlite)
npm run build && npm run check:bundle
npm run test:e2e
```

`npm run test:all` runs everything in the same order as CI.

## Contributions

Since this is one of my first projects in React, any suggestions or contributions are welcome! If you'd like to contribute, feel free to open a pull request or report any issues via the issues tab.

## Contact

For questions or suggestions, you can contact me via email: [solomon.taiwo@studenti.polito.it](mailto:solomon.taiwo@studenti.polito.it).

---
