/**
 * Offline read cache.
 *
 * The app is server-first, but on a phone the network disappears (metro,
 * plane, lift). Every successful read is mirrored here, and a failed read
 * falls back to the last copy instead of showing an empty screen — which is
 * also what App Review expects from a native-feeling app.
 *
 * Only GET responses are stored: writes still require a connection, so the
 * cache can never contain something the server rejected. Keys are namespaced
 * per user, so signing in as someone else never exposes the previous account.
 */

const PREFIX = "ducat-cache:";
const VERSION = 1;

/** Entries older than this are ignored: stale data is worse than a retry. */
export const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const cacheKey = (...parts) => `${PREFIX}${parts.join(":")}`;

export const writeOffline = (key, value, now = Date.now()) => {
  try {
    const payload = JSON.stringify({ v: VERSION, at: now, value });
    localStorage.setItem(cacheKey(key), payload);
    return true;
  } catch {
    // Quota exhausted or storage disabled (private mode): the app keeps working
    // without the offline copy.
    return false;
  }
};

export const readOffline = (key, { maxAgeMs = DEFAULT_MAX_AGE_MS, now = Date.now() } = {}) => {
  try {
    const raw = localStorage.getItem(cacheKey(key));
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || entry.v !== VERSION) return null;
    if (!("value" in entry)) return null;
    if (typeof entry.at !== "number" || now - entry.at > maxAgeMs) return null;
    return entry.value;
  } catch {
    return null;
  }
};

/** When the cached copy was written, or null when there is none. */
export const readOfflineAge = (key) => {
  try {
    const raw = localStorage.getItem(cacheKey(key));
    if (!raw) return null;
    const entry = JSON.parse(raw);
    return typeof entry?.at === "number" ? entry.at : null;
  } catch {
    return null;
  }
};

export const removeOffline = (key) => {
  try {
    localStorage.removeItem(cacheKey(key));
  } catch {
    // Ignore: nothing to clean up if storage is unavailable.
  }
};

/** Removes every cached entry of one user (account deletion). */
export const clearOfflineForUser = (userId) => {
  if (!userId) return;
  try {
    const suffix = `:${userId}`;
    const keys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(PREFIX) && key.includes(suffix)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
};

/** Test helper: wipes the whole cache. */
export const clearOffline = () => {
  try {
    const keys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
};
