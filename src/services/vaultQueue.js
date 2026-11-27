import { queueKey, mutationsKey } from "../utils/offlineQueue.js";
import { readVaultLocal, storeVaultLocal } from "../utils/vaultStorage.js";
import { currentVault } from "./vaultSession.js";
import { readLocalValue } from "../utils/storage.js";

export const hasLegacyVaultQueue = (uid) => Boolean(readLocalValue(queueKey(uid)) || readLocalValue(mutationsKey(uid)));

// Reuse the queue's validation and ordering on a synchronous working copy,
// then commit the encrypted result to IndexedDB with a cross-tab comparison.
export const runVaultQueue = async (uid, operation, archive = currentVault(uid)) => {
  if (!archive) return operation();
  const keys = [queueKey(uid), mutationsKey(uid)];
  const legacyValues = () => Object.fromEntries(keys.map((key) => [key, readLocalValue(key)]));
  const rows = (raw) => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return parsed?.v === 1 && Array.isArray(parsed.items) ? parsed.items.filter(Boolean) : [];
    } catch { return []; }
  };
  for (let attempt = 0; attempt < 8 && archive.isOpen(); attempt += 1) {
    const persisted = await readVaultLocal(uid, "queue");
    const original = persisted ? await archive.open(persisted, "queue") : {};
    const legacy = legacyValues();
    const next = { ...original };
    for (const [index, key] of keys.entries()) {
      if (!legacy[key]) continue;
      const identity = index === 0 ? "clientRequestId" : "id";
      const merged = new Map([...rows(legacy[key]), ...rows(original[key])].map((item) => [item[identity], item]));
      next[key] = JSON.stringify({ v: 1, items: [...merged.values()] });
    }
    const result = operation({
      getItem: (key) => next[key] ?? null,
      setItem: (key, value) => { next[key] = value; },
      removeItem: (key) => { next[key] = null; },
    });
    if (keys.every((key) => !legacy[key] && (original[key] ?? null) === (next[key] ?? null))) return result;
    const encrypted = await archive.seal(next, "queue");
    if (await storeVaultLocal(uid, "queue", encrypted, (current) => archive.isOpen() && current === persisted)) {
      for (const key of keys) {
        if (legacy[key] && legacy[key] === readLocalValue(key)) localStorage.removeItem(key);
      }
      return result;
    }
  }
  throw new Error("Offline queue changed on another tab");
};
