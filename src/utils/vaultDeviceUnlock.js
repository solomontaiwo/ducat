import { createDevicePin, createPairedVaultSession, decodeBytes, deviceSessionCrypto, encodeBytes, openPairedVaultSession, unlockDevicePin } from "./vaultCrypto.js";
import { readVaultLocal, removeVaultLocal, storeVaultLocal } from "./vaultStorage.js";

const MAX_PIN_ATTEMPTS = 5;
const DEVICE_UNLOCK = "device-unlock";
const PAIRED_SESSION = "paired-session";

export const loadVaultPin = async (uid, keys) => {
  if (keys?.v !== 2) return null;
  const entry = await readVaultLocal(uid, "pin");
  return entry?.recovery === keys.recovery ? entry : null;
};

export const isVaultPinLocked = (entry) => entry?.attempts >= MAX_PIN_ATTEMPTS;

export const clearVaultDeviceSession = (uid) => removeVaultLocal(uid, DEVICE_UNLOCK).catch(() => {});

export const saveVaultPin = async (uid, keys, pin, secret) => {
  const entry = await createDevicePin(uid, keys.recovery, pin, secret);
  await storeVaultLocal(uid, "pin", entry);
  await clearVaultDeviceSession(uid);
  return entry;
};

export const verifyVaultPin = async (uid, keys, pin) => {
  for (let attempt = 0; attempt < MAX_PIN_ATTEMPTS; attempt += 1) {
    const entry = await loadVaultPin(uid, keys);
    if (!entry || isVaultPinLocked(entry)) return { entry, locked: true };
    const matches = (record, count) => record?.ciphertext === entry.ciphertext && record.attempts === count;
    const nextAttempts = entry.attempts + 1;
    const reserved = await storeVaultLocal(uid, "pin", { ...entry, attempts: nextAttempts }, (current) => matches(current, entry.attempts));
    if (!reserved) continue;

    let secret;
    try {
      secret = await unlockDevicePin(uid, entry, pin);
    } catch {
      return { entry: { ...entry, attempts: nextAttempts }, locked: nextAttempts >= MAX_PIN_ATTEMPTS };
    }
    try {
      await storeVaultLocal(uid, "pin", { ...entry, attempts: 0 }, (current) => matches(current, nextAttempts));
      return { entry, secret };
    } catch (error) {
      secret.fill(0);
      throw error;
    }
  }
  throw new Error("Archive PIN changed on another tab");
};

export const rememberVaultDeviceSession = async (uid, entry, secret) => {
  const cryptography = await deviceSessionCrypto(uid, entry);
  const sealed = await cryptography.seal({ secret: encodeBytes(secret), recovery: entry.recovery });
  await storeVaultLocal(uid, DEVICE_UNLOCK, { sealed });
};

export const resumeVaultDeviceSession = async (uid, entry) => {
  if (!entry || isVaultPinLocked(entry)) return null;
  const stored = await readVaultLocal(uid, DEVICE_UNLOCK);
  if (!stored?.sealed) return null;
  try {
    const cryptography = await deviceSessionCrypto(uid, entry);
    const saved = await cryptography.open(stored.sealed);
    return typeof saved?.secret === "string" ? decodeBytes(saved.secret) : null;
  } catch {
    // A changed PIN or key invalidates the remembered device unlock.
    return null;
  }
};

export const clearPairedVaultSession = (uid) => removeVaultLocal(uid, PAIRED_SESSION).catch(() => {});

export const rememberPairedVaultSession = async (uid, keys, authSession, secret) => {
  const entry = await createPairedVaultSession(uid, authSession, keys.recovery, secret);
  await storeVaultLocal(uid, PAIRED_SESSION, entry);
};

export const resumePairedVaultSession = async (uid, keys, getAuthSession) => {
  const entry = await readVaultLocal(uid, PAIRED_SESSION);
  if (!entry || keys?.v !== 2) return null;
  const authSession = await getAuthSession(uid);
  if (!authSession || authSession !== entry.authSession) return null;
  return openPairedVaultSession(uid, authSession, keys.recovery, entry);
};
