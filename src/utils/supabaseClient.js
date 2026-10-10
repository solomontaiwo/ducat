import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const missing = [
  ["VITE_SUPABASE_URL", supabaseUrl],
  ["VITE_SUPABASE_PUBLISHABLE_KEY", supabaseKey],
].filter(([, value]) => !value).map(([name]) => name);

if (missing.length > 0) {
  throw new Error(
    "[supabase] Missing required environment variables: " + missing.join(", ") +
      ". Create a local .env from .env.example or configure the CI secrets."
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Confirmation and password-reset links come back with the session in the URL.
    detectSessionInUrl: true,
    flowType: "implicit",
    storageKey: "soldi-sotto-auth",
  },
});

// PostgREST / Postgres error codes mapped onto the codes the UI already knows.
const DATA_ERROR_CODES = {
  42501: "permission-denied", // insufficient privilege / row level security
  PGRST301: "unauthenticated", // expired or invalid JWT
  23505: "already-exists",
  23514: "invalid-argument", // check constraint
  "22P02": "invalid-argument",
};

export const toDataError = (error) => {
  const mapped = new Error(error?.message || "Database request failed");
  mapped.code = DATA_ERROR_CODES[error?.code] || error?.code || "unknown";
  mapped.cause = error;
  return mapped;
};

/** Returns `data` from a supabase-js response, throwing a mapped error on failure. */
export const unwrap = (response) => {
  if (response.error) throw toDataError(response.error);
  return response.data;
};
