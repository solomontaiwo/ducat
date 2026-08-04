import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  verifyBeforeUpdateEmail,
} from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { auth } from "../utils/firebaseAuth";
import { firebaseApp } from "../utils/firebaseApp";
import { ensureFirebaseAppCheck } from "../utils/firebaseAppCheck";

const functionsRegion = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "europe-west1";

export const reauthenticateWithPassword = async (password) => {
  const user = auth.currentUser;
  if (!user?.email) throw new Error("auth/no-current-user");
  return reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
};

export const requestPasswordReset = async () => {
  if (!auth.currentUser?.email) throw new Error("auth/no-current-user");
  await sendPasswordResetEmail(auth, auth.currentUser.email);
};

export const requestEmailChange = async (newEmail, password) => {
  await reauthenticateWithPassword(password);
  await verifyBeforeUpdateEmail(auth.currentUser, newEmail.trim().toLowerCase());
};

export const deleteCurrentAccount = async (password) => {
  await reauthenticateWithPassword(password);
  await auth.currentUser.getIdToken(true);
  const appCheck = await ensureFirebaseAppCheck();
  if (!appCheck) throw new Error("app-check/not-configured");
  const functions = getFunctions(firebaseApp, functionsRegion);
  const deleteAccount = httpsCallable(functions, "deleteAccount");
  await deleteAccount();
};
