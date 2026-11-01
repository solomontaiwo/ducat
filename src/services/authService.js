import { supabase } from "../utils/supabaseClient.js";
import { toEmailLanguage } from "../utils/emailLanguage.js";
import { isDesktop, isMobile } from "../platform/index.js";

const PUBLIC_WEB_URL = "https://solomontaiwo.github.io/soldi-sotto/";

/**
 * Absolute URL of an app route, used for the links in auth emails.
 *
 * The packaged shells (desktop and iOS) have no public origin of their own, so
 * their emails must point at the deployed web app: `capacitor://localhost` or
 * a Tauri asset URL would never open. Both therefore require the public URL.
 */
export const appUrl = (path = "") => {
  const packaged = isDesktop() || isMobile();
  const base = packaged
    ? new URL(import.meta.env.VITE_DESKTOP_WEB_URL || PUBLIC_WEB_URL)
    : new URL(import.meta.env.BASE_URL || "/", window.location.origin);
  if (packaged && (base.protocol !== "https:" || !base.pathname.endsWith("/"))) {
    throw new Error("The public web URL must be HTTPS and end with a slash");
  }
  return new URL(String(path).replace(/^\/+/, ""), base).href;
};

/**
 * The account as the app sees it. The shape mirrors what the UI used with
 * Firebase (uid, email, emailVerified, displayName, metadata.creationTime).
 */
export const toAppUser = (user) => {
  if (!user) return null;
  return {
    uid: user.id,
    email: user.email ?? null,
    emailVerified: Boolean(user.email_confirmed_at || user.confirmed_at),
    displayName: user.user_metadata?.display_name ?? null,
    // Language of the auth emails; the templates read user_metadata.lang.
    language: user.user_metadata?.lang ?? null,
    // Accounts moved from Firebase keep their original sign-up date.
    metadata: { creationTime: user.user_metadata?.member_since ?? user.created_at ?? null },
  };
};

const AUTH_CODES = {
  invalid_credentials: "auth/invalid-credential",
  user_not_found: "auth/invalid-credential",
  email_not_confirmed: "auth/email-not-verified",
  user_already_exists: "auth/email-already-in-use",
  email_exists: "auth/email-already-in-use",
  weak_password: "auth/weak-password",
  same_password: "auth/same-password",
  over_request_rate_limit: "auth/too-many-requests",
  over_email_send_rate_limit: "auth/too-many-requests",
  email_address_invalid: "auth/invalid-email",
  validation_failed: "auth/invalid-email",
  signup_disabled: "auth/operation-not-allowed",
  email_provider_disabled: "auth/operation-not-allowed",
  session_not_found: "auth/no-current-user",
  session_expired: "auth/no-current-user",
};

/** Supabase auth errors carry `code`; the UI uses its own stable codes. */
export const toAuthError = (error) => {
  const mapped = new Error(error?.message || "Authentication failed");
  mapped.code = AUTH_CODES[error?.code]
    || (error?.status === 429 ? "auth/too-many-requests" : `auth/${error?.code || "unknown"}`);
  mapped.cause = error;
  return mapped;
};

const unwrapAuth = ({ data, error }) => {
  if (error) throw toAuthError(error);
  return data;
};

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

export const signIn = async (email, password) => {
  const data = unwrapAuth(await supabase.auth.signInWithPassword({ email: normalizeEmail(email), password }));
  return toAppUser(data.user);
};

/**
 * Creates the account. With email confirmation on (production) there is no
 * session until the link in the email is opened.
 */
export const signUp = async ({ email, password, displayName, language }) => {
  const data = unwrapAuth(await supabase.auth.signUp({
    email: normalizeEmail(email),
    password,
    options: {
      data: { display_name: displayName, lang: toEmailLanguage(language) },
      emailRedirectTo: appUrl("dashboard"),
    },
  }));
  // An address that is already registered comes back as a user without
  // identities (and no email is sent).
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw toAuthError({ code: "user_already_exists", message: "User already registered" });
  }
  return { user: toAppUser(data.user), hasSession: Boolean(data.session) };
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw toAuthError(error);
};

export const resendVerificationEmail = async (email) => {
  unwrapAuth(await supabase.auth.resend({
    type: "signup",
    email: normalizeEmail(email),
    options: { emailRedirectTo: appUrl("dashboard") },
  }));
};

export const sendPasswordReset = async (email) => {
  unwrapAuth(await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
    redirectTo: appUrl("reset-password"),
  }));
};

export const updatePassword = async (password) => {
  unwrapAuth(await supabase.auth.updateUser({ password }));
};

/** Sends a confirmation link; the address changes once it is opened. */
export const updateEmail = async (email) => {
  unwrapAuth(await supabase.auth.updateUser(
    { email: normalizeEmail(email) },
    { emailRedirectTo: appUrl("profile") }
  ));
};

export const updateDisplayName = async (displayName) => {
  const data = unwrapAuth(await supabase.auth.updateUser({ data: { display_name: displayName } }));
  return toAppUser(data.user);
};

/** Keeps the language of the auth emails in step with the app. */
export const updateLanguage = async (language) => {
  const data = unwrapAuth(await supabase.auth.updateUser({ data: { lang: toEmailLanguage(language) } }));
  return toAppUser(data.user);
};

/** Signed-in user from the stored session (no network). */
export const getSessionUser = async () => {
  const { data } = await supabase.auth.getSession();
  return toAppUser(data.session?.user);
};

/** Fresh user from the server, e.g. after the email has been confirmed. */
export const reloadUser = async () => {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return null;
  const data = unwrapAuth(await supabase.auth.getUser());
  return toAppUser(data.user);
};

export const onAuthChange = (callback) => {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(toAppUser(session?.user), event);
  });
  return () => data.subscription.unsubscribe();
};
