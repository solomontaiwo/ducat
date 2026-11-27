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

import { DEFAULT_CURRENCY, MAX_AMOUNT_MINOR, getTransactionAmountMinor, minorToMajor, parseMoneyToMinor } from "./money.js";
import { coerceDateKey, dateKeyToDate, isDateKey } from "./dateUtils.js";
import { transactionComparator } from "./transactionOrder.js";

const PREFIX = "ducat-offline-queue:";
const MUTATIONS_PREFIX = "ducat-offline-mutations:";
const VERSION = 1;
const MAX_QUEUE_SIZE = 100;
const VALID_FREQUENCIES = new Set(["weekly", "monthly", "yearly"]);
const VALID_MODES = new Set(["auto", "confirm"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const queueKey = (userId) => `${PREFIX}${userId}`;
const mutationsKey = (userId) => `${MUTATIONS_PREFIX}${userId}`;
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

/** Removes a queued transaction by its synthetic transaction id (`<uid>_<reqId>`) or `clientRequestId`. */
export const removeOfflineTransactionById = (userId, transactionId) => {
  if (!userId || !transactionId) return { removed: false, queue: [], pending: [] };
  const current = readOfflineQueue(userId);
  const next = current.filter((item) => (
    item.clientRequestId !== transactionId && queuedItemToTransaction(userId, item).id !== transactionId
  ));
  if (next.length === current.length) {
    return {
      removed: false,
      queue: current,
      pending: current.map((item) => queuedItemToTransaction(userId, item)),
    };
  }
  writeQueue(userId, next);
  return {
    removed: true,
    queue: next,
    pending: next.map((item) => queuedItemToTransaction(userId, item)),
  };
};

/** Updates a queued offline transaction in-place by synthetic transaction id or `clientRequestId`. */
export const updateOfflineTransaction = (userId, transactionId, patch = {}) => {
  if (!userId || !transactionId) return { ok: false, queue: [], pending: [] };
  const current = readOfflineQueue(userId);
  const index = current.findIndex((item) => (
    item.clientRequestId === transactionId || queuedItemToTransaction(userId, item).id === transactionId
  ));
  if (index < 0) return { ok: false, queue: current, pending: current.map((item) => queuedItemToTransaction(userId, item)) };
  const existing = current[index];
  const merged = { ...existing.payload, ...patch };
  const validated = validateInput(merged);
  const recurring = validateRecurring(merged.recurring);
  const updatedEntry = {
    ...existing,
    payload: recurring ? { ...validated, recurring } : validated,
  };
  const next = current.map((item, idx) => (idx === index ? updatedEntry : item));
  const saved = writeQueue(userId, next);
  const queue = saved ? next : current;
  return {
    ok: saved,
    entry: updatedEntry,
    queue,
    pending: queue.map((item) => queuedItemToTransaction(userId, item)),
  };
};

/** Wipes every offline write queue on the device (account deletion). */
export const clearAllOfflineQueues = () => {
  try {
    const keys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(PREFIX) || key?.startsWith(MUTATIONS_PREFIX)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // Ignore storage errors.
  }
};

const writeMutations = (userId, items) => {
  try {
    if (!items.length) localStorage.removeItem(mutationsKey(userId));
    else localStorage.setItem(mutationsKey(userId), JSON.stringify({ v: VERSION, items }));
    return true;
  } catch {
    return false;
  }
};

const validatePatch = (patch = {}) => {
  const out = {};
  if (patch.amountMinor !== undefined || patch.amount !== undefined) {
    const amountMinor = Number.isSafeInteger(patch.amountMinor) ? patch.amountMinor : parseMoneyToMinor(patch.amount);
    if (!Number.isInteger(amountMinor) || amountMinor <= 0 || amountMinor > MAX_AMOUNT_MINOR) throw validationError("Invalid amount");
    out.amountMinor = amountMinor;
  }
  if (patch.currency !== undefined) {
    if (patch.currency !== "EUR") throw validationError("Invalid currency");
    out.currency = patch.currency;
  }
  if (patch.description !== undefined) {
    const description = typeof patch.description === "string" ? patch.description.trim() : "";
    if (!description || description.length > 200) throw validationError("Invalid description");
    out.description = description;
  }
  if (patch.category !== undefined) {
    const category = typeof patch.category === "string" ? patch.category.trim() : "";
    if (!category || category.length > 60) throw validationError("Invalid category");
    out.category = category;
  }
  if (patch.dateKey !== undefined || patch.date !== undefined) {
    const dateKey = patch.dateKey || coerceDateKey(patch.date);
    if (!isDateKey(dateKey)) throw validationError("Invalid date key");
    out.dateKey = dateKey;
  }
  if (patch.type !== undefined) {
    if (patch.type !== "income" && patch.type !== "expense") throw validationError("Invalid type");
    out.type = patch.type;
  }
  if (!Object.keys(out).length) throw validationError("Empty patch");
  return out;
};

/** Reads queued offline updates/deletes for already-synced server transactions. */
export const readOfflineMutations = (userId) => {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(mutationsKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== VERSION || !Array.isArray(parsed.items)) return [];
    return parsed.items.filter((item) => item && typeof item.id === "string" && (item.op === "update" || item.op === "delete"));
  } catch {
    return [];
  }
};

/** Queues an offline edit for an existing server transaction, coalescing repeated edits. */
export const enqueueOfflineUpdate = (userId, transactionId, patch) => {
  if (!userId || !transactionId) return { ok: false, mutations: [] };
  const validPatch = validatePatch(patch);
  const current = readOfflineMutations(userId);
  const existingIndex = current.findIndex((item) => item.id === transactionId);
  let next;
  if (existingIndex >= 0) {
    if (current[existingIndex].op === "delete") return { ok: false, mutations: current };
    next = current.map((item, idx) => (idx === existingIndex
      ? { ...item, patch: { ...item.patch, ...validPatch }, queuedAt: Date.now() }
      : item));
  } else {
    if (current.length >= MAX_QUEUE_SIZE) return { ok: false, reason: "queue-full", mutations: current };
    next = [...current, { op: "update", id: transactionId, patch: validPatch, queuedAt: Date.now() }];
  }
  const saved = writeMutations(userId, next);
  return { ok: saved, mutations: saved ? next : current };
};

/** Queues an offline deletion for an existing server transaction (supersedes queued edits). */
export const enqueueOfflineDelete = (userId, transactionId) => {
  if (!userId || !transactionId) return { ok: false, mutations: [] };
  const current = readOfflineMutations(userId);
  const withoutExisting = current.filter((item) => item.id !== transactionId);
  if (withoutExisting.length >= MAX_QUEUE_SIZE && withoutExisting.length === current.length) {
    return { ok: false, reason: "queue-full", mutations: current };
  }
  const next = [...withoutExisting, { op: "delete", id: transactionId, queuedAt: Date.now() }];
  const saved = writeMutations(userId, next);
  return { ok: saved, mutations: saved ? next : current };
};

/** Overlays queued offline updates and hides queued offline deletes on any transaction list. */
export const applyOfflineMutations = (rows = [], mutations = []) => {
  if (!mutations?.length || !rows?.length) return rows;
  const deletedIds = new Set();
  const updates = new Map();
  for (const item of mutations) {
    if (item.op === "delete") deletedIds.add(item.id);
    else if (item.op === "update") updates.set(item.id, item.patch);
  }
  return rows.flatMap((row) => {
    if (deletedIds.has(row.id)) return [];
    const patch = updates.get(row.id);
    if (!patch) return [row];
    const nextMinor = patch.amountMinor ?? row.amountMinor;
    const nextDateKey = patch.dateKey ?? row.dateKey;
    return [{
      ...row,
      ...patch,
      amountMinor: nextMinor,
      amount: minorToMajor(nextMinor),
      dateKey: nextDateKey,
      date: nextDateKey ? dateKeyToDate(nextDateKey) : row.date,
      pendingSync: true,
    }];
  });
};

/** Replays queued offline updates and deletes in FIFO order. */
export const flushOfflineMutations = async (userId, { update, remove }, onRemaining) => {
  const queued = readOfflineMutations(userId);
  if (!queued.length) {
    onRemaining?.([]);
    return { synced: 0, failed: 0 };
  }
  let synced = 0;
  let failed = 0;
  for (const entry of queued) {
    try {
      if (entry.op === "update") {
        await update(entry.id, entry.patch);
      } else if (entry.op === "delete") {
        try {
          await remove(entry.id);
        } catch (error) {
          // Already deleted on another device: treat as idempotent success.
          if (error?.code !== "permission-denied") throw error;
        }
      }
      const remaining = readOfflineMutations(userId).filter((item) => item.id !== entry.id);
      writeMutations(userId, remaining);
      onRemaining?.(remaining);
      synced += 1;
    } catch (error) {
      console.error("Failed to sync offline mutation:", error);
      failed += 1;
      break;
    }
  }
  return { synced, failed };
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
export const mergePendingTransactions = (remote, pending, { type = "all", category = "all", startDate, endDate, sortBy } = {}) => {
  if (!pending?.length) return remote;
  const startKey = startDate ? coerceDateKey(startDate) : null;
  const endKey = endDate ? coerceDateKey(endDate) : null;
  const seen = new Set(remote.map((item) => item.id));
  const extras = pending.filter((item) => (
    !seen.has(item.id)
    && (category === "all" || item.category === category)
    && (type === "all" || item.type === type)
    && (!startKey || item.dateKey >= startKey)
    && (!endKey || item.dateKey <= endKey)
  ));
  return extras.length ? [...extras, ...remote].sort(transactionComparator(sortBy)) : remote;
};

const matchesOfflineFilters = (item, { type = "all", category, startKey, endKey }) => {
  if (!item || (category !== "all" && item.category !== category)) return false;
  if (type !== "all" && item.type !== type) return false;
  const key = item.dateKey || coerceDateKey(item.date);
  if (startKey && key < startKey) return false;
  if (endKey && key > endKey) return false;
  return true;
};

/** Combines cached server transactions and pending offline writes matching filters, newest first. */
export const filterOfflineTransactions = (remote = [], pending = [], { type = "all", category = "all", startDate, endDate, sortBy } = {}) => {
  const startKey = startDate ? coerceDateKey(startDate) : null;
  const endKey = endDate ? coerceDateKey(endDate) : null;
  const filters = { type, category, startKey, endKey };
  const merged = new Map();
  for (const item of remote) {
    if (matchesOfflineFilters(item, filters)) merged.set(item.id, item);
  }
  for (const item of pending) {
    if (!merged.has(item.id) && matchesOfflineFilters(item, filters)) merged.set(item.id, item);
  }
  return Array.from(merged.values()).sort(transactionComparator(sortBy));
};

/** Builds a paginated slice from local + pending transactions when the device is offline. */
export const buildOfflinePage = (remote = [], pending = [], { pageSize = 40, cursor = null, type = "all", category = "all", sortBy, startDate, endDate } = {}) => {
  const rows = filterOfflineTransactions(remote, pending, { type, category, sortBy, startDate, endDate });
  const offset = typeof cursor === "number" && cursor >= 0 ? cursor : 0;
  const items = rows.slice(offset, offset + pageSize);
  const nextOffset = offset + items.length;
  const hasMore = nextOffset < rows.length;
  return {
    items,
    nextCursor: hasMore ? nextOffset : null,
    hasMore,
  };
};

/** Computes count and income/expense minor totals locally when offline (or for pending deltas). */
export const computeOfflineTotals = (remote = [], pending = [], { type = "all", category = "all", startDate, endDate, sortBy } = {}) => {
  const rows = filterOfflineTransactions(remote, pending, { type, category, sortBy, startDate, endDate });
  let incomeMinor = 0;
  let expenseMinor = 0;
  for (const item of rows) {
    const minor = getTransactionAmountMinor(item);
    if (item.type === "income") incomeMinor += minor;
    else if (item.type === "expense") expenseMinor += minor;
  }
  return { count: rows.length, incomeMinor, expenseMinor };
};

/** Adds unsynced pending offline items onto server totals. */
export const mergePendingTotals = (serverTotals, serverRows, pending, options = {}) => {
  if (!pending?.length) return serverTotals;
  const seen = new Set(serverRows.map((item) => item.id));
  const extra = computeOfflineTotals([], pending.filter((item) => !seen.has(item.id)), options);
  return {
    count: serverTotals.count + extra.count,
    incomeMinor: serverTotals.incomeMinor + extra.incomeMinor,
    expenseMinor: serverTotals.expenseMinor + extra.expenseMinor,
  };
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
