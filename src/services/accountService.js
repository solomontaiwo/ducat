import { supabase, unwrap } from "../utils/supabaseClient.js";
import { sendPasswordReset, signIn, toAuthError, updateEmail } from "./authService.js";
import { clearOffline } from "../utils/offlineCache.js";
import { currentVault, setCurrentVault } from "./vaultSession.js";
import { archiveKeychain } from "../platform/authStorage.js";
import { clearAllOfflineQueues } from "../utils/offlineQueue.js";
import { setBiometricLockEnabled } from "../platform/biometricLock.js";
import { clearRecurringReminders } from "../platform/reminders.js";
import { resetReviewState } from "../platform/appReview.js";

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
  const user = await reauthenticateWithPassword(password);
  unwrap(await supabase.rpc("delete_my_account"));
  if (user?.uid) {
    if (currentVault(user.uid)) setCurrentVault(null);
    const { clearVaultLocal } = await import("../utils/vaultStorage.js");
    await Promise.allSettled([clearVaultLocal(user.uid), archiveKeychain.remove(user.uid)]);
  }
  // The offline copy and queued writes must not outlive the account they belong to.
  clearOffline();
  clearAllOfflineQueues();
  setBiometricLockEnabled(false);
  await clearRecurringReminders();
  resetReviewState();
  await supabase.auth.signOut({ scope: "local" });
};
