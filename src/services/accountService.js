import { supabase, unwrap } from "../utils/supabaseClient.js";
import { sendPasswordReset, signIn, toAuthError, updateEmail } from "./authService.js";
import { clearOffline } from "../utils/offlineCache.js";

const currentEmail = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw toAuthError(error);
  const email = data.session?.user?.email;
  if (!email) throw Object.assign(new Error("No signed-in user"), { code: "auth/no-current-user" });
  return email;
};

/** Confirms the password of the signed-in account before a sensitive change. */
export const reauthenticateWithPassword = async (password) => {
  const email = await currentEmail();
  return signIn(email, password);
};

export const requestPasswordReset = async () => {
  await sendPasswordReset(await currentEmail());
};

export const requestEmailChange = async (newEmail, password) => {
  await reauthenticateWithPassword(password);
  await updateEmail(newEmail);
};

/** Deletes the account; the database removes every row it owns. */
export const deleteCurrentAccount = async (password) => {
  await reauthenticateWithPassword(password);
  unwrap(await supabase.rpc("delete_my_account"));
  // The offline copy must not outlive the account it belongs to.
  clearOffline();
  await supabase.auth.signOut({ scope: "local" });
};
