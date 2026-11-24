/**
 * Persistent offline write queue for new transactions.
 *
 * Transactions are validated before being queued and carry an idempotent
 * `clientRequestId` (`<uid>_<requestId>`), so replaying the queue on reconnect
 * can never duplicate a record even if a retry happens mid-flight.
 *
 * Keys are namespaced per user so switching accounts never leaks pending items,
 * and account deletion wipes every queue on the device.
 */

import { DEFAULT_CURRENCY, MAX_AMOUNT_MINOR, minorToMajor, parseMoneyToMinor } from "./money.js";
import { coerceDateKey, dateKeyToDate, isDateKey } from "./dateUtils.js";
import { compareTransactions } from "./transactionOrder.js";

const PREFIX = "ducat-offline-queue:";
const VERSION = 1;
const MAX_QUEUE_SIZE = 100;
const VALID_FREQUENCIES = new Set(["weekly", "monthly", "yearly"]);
const VALID_MODES = new Set(["auto", "confirm"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const queueKey = (userId) => `${PREFIX}${userId}`;
const safeId = (value) => String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);

const validationError = (message) => Object.assign(new Error(message), { issues: [{ message }] });

const validateInput = (data) => {
  const amountMinor = Number.isSafeInteger(data.amountMinor) ? data.amountMinor : parseMoneyToMinor(data.amount);
  if (!Number.isInteger(amountMinor) || amountMinor <= 0 || amountMinor > MAX_AMOUNT_MINOR) {
    throw validationError("Invalid amount");
  }
  const currency = data.currency || DEFAULT_CURRENCY;
  if (currency !== "EUR") throw validationError("Invalid currency");
  const description = typeof data.description === "string" ? data.description.trim() : "";
  if (!description || description.length > 200) throw validationError("Invalid description");
  const category = typeof data.category === "string" ? data.category.trim() : "";
  if (!category || category.length > 60) throw validationError("Invalid category");
  const dateKey = data.dateKey || coerceDateKey(data.date);
  if (!isDateKey(dateKey)) throw validationError("Invalid date key");
  if (data.type !== "income" && data.type !== "expense") throw validationError("Invalid type");
  return { amountMinor, currency, description, dateKey, category, type: data.type };
};

const validateRecurring = (rule) => {
  if (!rule) return undefined;
  if (typeof rule.id !== "string" || !UUID_RE.test(rule.id)) throw validationError("Invalid recurring id");
  if (!VALID_FREQUENCIES.has(rule.frequency)) throw validationError("Invalid recurring frequency");
  if (!VALID_MODES.has(rule.mode)) throw validationError("Invalid recurring mode");
  return { id: rule.id, frequency: rule.frequency, mode: rule.mode };
};

const sanitizeItem = (data, clientRequestId) => {
  const input = validateInput(data);
  const recurring = validateRecurring(data.recurring);
  return {
    clientRequestId: String(clientRequestId || crypto.randomUUID()),
    payload: recurring ? { ...input, recurring } : input,
    queuedAt: Date.now(),
  };
};

const writeQueue = (userId, items) => {
  try {
    if (!items.length) {
      localStorage.removeItem(queueKey(userId));
    } else {
      localStorage.setItem(queueKey(userId), JSON.stringify({ v: VERSION, items }));
    }
    return true;
  } catch {
    return false;
  }
};

export const readOfflineQueue = (userId) => {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(queueKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== VERSION || !Array.isArray(parsed.items)) return [];
    return parsed.items.filter((item) => item && typeof item.clientRequestId === "string" && item.payload);
  } catch {
    return [];
  }
};

/** Validates and adds a pending transaction; deduplicates by `clientRequestId`. */
export const enqueueOfflineTransaction = (userId, data, { requestId } = {}) => {
  if (!userId) throw new Error("Missing user id");
  const entry = sanitizeItem(data, requestId || data.clientRequestId);
  const current = readOfflineQueue(userId);
  const existingIndex = current.findIndex((item) => item.clientRequestId === entry.clientRequestId);
  if (existingIndex >= 0) {
    return {
      ok: true,
      entry: current[existingIndex],
      queue: current,
      pending: current.map((item) => queuedItemToTransaction(userId, item)),
    };
  }
  if (current.length >= MAX_QUEUE_SIZE) {
    return { ok: false, reason: "queue-full", queue: current };
  }
  const next = [...current, entry];
  const saved = writeQueue(userId, next);
  const queue = saved ? next : current;
  return {
    ok: saved,
    entry,
    queue,
    pending: queue.map((item) => queuedItemToTransaction(userId, item)),
  };
};

export const removeOfflineTransaction = (userId, clientRequestId) => {
  if (!userId) return [];
  const next = readOfflineQueue(userId).filter((item) => item.clientRequestId !== clientRequestId);
  writeQueue(userId, next);
  return next;
};

export const clearOfflineQueue = (userId) => {
  if (!userId) return;
  try {
    localStorage.removeItem(queueKey(userId));
  } catch {
    // Ignore storage errors.
  }
};

/** Wipes every offline write queue on the device (account deletion). */
export const clearAllOfflineQueues = () => {
  try {
    const keys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // Ignore storage errors.
  }
};

/** Converts a queued entry into the transaction shape used by Dashboard and lists. */
export const queuedItemToTransaction = (userId, item) => {
  const { payload, clientRequestId, queuedAt } = item;
  return {
    id: `${safeId(userId)}_${safeId(clientRequestId)}`,
    userId,
    type: payload.type,
    amountMinor: payload.amountMinor,
    amount: minorToMajor(payload.amountMinor),
    currency: payload.currency || DEFAULT_CURRENCY,
    description: payload.description,
    category: payload.category,
    dateKey: payload.dateKey,
    date: dateKeyToDate(payload.dateKey),
    schemaVersion: 2,
    createdAt: new Date(queuedAt),
    updatedAt: new Date(queuedAt),
    pendingSync: true,
    clientRequestId,
  };
};

/** Merges optimistic pending items ahead of remote rows, filtered and deduplicated by id. */
export const mergePendingTransactions = (remote, pending, { type = "all", startDate, endDate } = {}) => {
  if (!pending?.length) return remote;
  const startKey = startDate ? coerceDateKey(startDate) : null;
  const endKey = endDate ? coerceDateKey(endDate) : null;
  const seen = new Set(remote.map((item) => item.id));
  const extras = pending.filter((item) => (
    !seen.has(item.id)
    && (type === "all" || item.type === type)
    && (!startKey || item.dateKey >= startKey)
    && (!endKey || item.dateKey <= endKey)
  ));
  return extras.length ? [...extras, ...remote].sort(compareTransactions) : remote;
};

/** Replays queued writes in FIFO order using idempotent request IDs. */
export const flushOfflineQueue = async (userId, submit, onRemaining) => {
  const queued = readOfflineQueue(userId);
  if (!queued.length) {
    onRemaining?.([]);
    return { synced: 0, failed: 0 };
  }
  let synced = 0;
  let failed = 0;
  for (const entry of queued) {
    try {
      await submit(entry);
      const remaining = removeOfflineTransaction(userId, entry.clientRequestId);
      onRemaining?.(remaining.map((item) => queuedItemToTransaction(userId, item)));
      synced += 1;
    } catch (error) {
      console.error("Failed to sync offline transaction:", error);
      failed += 1;
      break;
    }
  }
  return { synced, failed };
};
