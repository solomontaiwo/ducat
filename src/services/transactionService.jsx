import { supabase, toDataError, unwrap } from "../utils/supabaseClient.js";
import { emitLocalChange, watchTable } from "./changeEvents.js";
import { readOffline, writeOffline } from "../utils/offlineCache.js";
import { transactionV2InputSchema, transactionV2PatchSchema } from "../schemas/transaction.jsx";
import { DEFAULT_CURRENCY, minorToMajor, parseMoneyToMinor } from "../utils/money.js";
import { compareTransactions, transactionComparator } from "../utils/transactionOrder.js";
import { coerceDateKey, dateKeyToDate, isDateKey } from "../utils/dateUtils.js";
import { currentVault, vaultRecord } from "./vaultSession.js";
import { computeOfflineTotals, filterOfflineTransactions } from "../utils/offlineQueue.js";
import { recurringDraftSchema } from "../schemas/planning.js";

const TABLE = "transactions";
const COLUMNS = "id, user_id, type, amount_minor, currency, description, category, date_key, schema_version, created_at, updated_at";
const DEFAULT_TTL_MS = 3 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 40;
// PostgREST returns at most 1000 rows per request on Supabase by default.
const BATCH_SIZE = 1000;
const dataCache = new Map();
const countCache = new Map();
const totalsCache = new Map();
const inFlight = new Map();
let cacheRevision = 0;

const safeId = (value) => String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
const cursorId = (value) => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(value)) {
    throw Object.assign(new Error("Invalid transaction cursor"), { code: "invalid-argument" });
  }
  return value;
};

export { compareTransactions };

/** A database row in the shape the app uses everywhere. */
const normalizeRow = (row) => {
  const amountMinor = Number(row.amount_minor);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("Invalid amount");
  const dateKey = String(row.date_key).slice(0, 10);
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    amountMinor,
    amount: minorToMajor(amountMinor),
    currency: row.currency || DEFAULT_CURRENCY,
    description: row.description,
    category: row.category,
    dateKey,
    date: dateKeyToDate(dateKey),
    schemaVersion: row.schema_version || 2,
    createdAt: row.created_at ? new Date(row.created_at) : null,
    updatedAt: row.updated_at ? new Date(row.updated_at) : null,
  };
};

const normalizeRows = (rows, onInvalid, compare = compareTransactions) => rows.flatMap((row) => {
  try {
    return [normalizeRow(row)];
  } catch (error) {
    onInvalid?.({ id: row.id, code: "invalid-transaction", error });
    return [];
  }
}).sort(compare);

const applyFilters = (builder, { userId, type = "all", category = "all", startDate, endDate }) => {
  let query = builder.eq("user_id", userId);
  if (category !== "all") query = query.eq("category", category);
  if (type !== "all") query = query.eq("type", type);
  if (startDate) query = query.gte("date_key", coerceDateKey(startDate));
  if (endDate) query = query.lte("date_key", coerceDateKey(endDate));
  return query;
};

const orderNewestFirst = (query) => query.order("date_key", { ascending: false }).order("id", { ascending: false });

const queryKey = ({ userId, type = "all", category = "all", startDate, endDate }) => [
  userId,
  type,
  category,
  startDate ? coerceDateKey(startDate) : "start",
  endDate ? coerceDateKey(endDate) : "end",
].join(":");

const dedupe = async (key, loader) => {
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = loader().finally(() => {
    if (inFlight.get(key) === promise) inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
};

const invalidateCache = () => {
  cacheRevision += 1;
  dataCache.clear();
  countCache.clear();
  totalsCache.clear();
  inFlight.clear();
};

const afterWrite = () => {
  invalidateCache();
  emitLocalChange(TABLE);
};

/** Every row of a query, fetched in batches. */
const selectAll = async (filters, columns = COLUMNS) => {
  const rows = [];
  for (let from = 0; ; from += BATCH_SIZE) {
    const batch = unwrap(await orderNewestFirst(applyFilters(supabase.from(TABLE).select(columns), filters))
      .range(from, from + BATCH_SIZE - 1));
    rows.push(...batch);
    if (batch.length < BATCH_SIZE) return rows;
  }
};

const isAlreadyCreated = async (id) => {
  try {
    const existing = unwrap(await supabase.from(TABLE).select("id").eq("id", id).maybeSingle());
    return Boolean(existing);
  } catch {
    return false;
  }
};

const toV2Input = (data) => transactionV2InputSchema.parse({
  amountMinor: Number.isSafeInteger(data.amountMinor) ? data.amountMinor : parseMoneyToMinor(data.amount),
  currency: data.currency || DEFAULT_CURRENCY,
  description: data.description,
  dateKey: data.dateKey || coerceDateKey(data.date),
  category: data.category,
  type: data.type,
});

export const toTransactionRow = (input) => {
  const row = {};
  if (input.amountMinor !== undefined) row.amount_minor = input.amountMinor;
  if (input.currency !== undefined) row.currency = input.currency;
  if (input.description !== undefined) row.description = input.description;
  if (input.dateKey !== undefined) row.date_key = input.dateKey;
  if (input.category !== undefined) row.category = input.category;
  if (input.type !== undefined) row.type = input.type;
  return row;
};

const notFound = () => Object.assign(new Error("Transaction not found"), { code: "permission-denied" });

export const transactionRecord = (id, userId, fields) => {
  const timestamp = new Date().toISOString();
  return vaultRecord(TABLE, id, { id, user_id: userId, schema_version: 2, created_at: timestamp, updated_at: timestamp, ...fields });
};

const readVaultTransactions = (vault, options) => vault.read(({ list }) =>
  filterOfflineTransactions(normalizeRows(list(TABLE), options?.onInvalid), [], options), options?.forceRefresh);

export const TransactionService = {
  /** The most recently created transactions, kept current while subscribed. */
  subscribeToRecent: (userId, limitCount, onUpdate, onError, onInvalid) => {
    const vault = currentVault(userId);
    const cacheId = `transactions-recent:${userId}:${limitCount}`;
    let active = true;
    let request = 0;
    const reload = async () => {
      const currentRequest = ++request;
      try {
        const rows = vault ? await vault.read(({ list }) => list(TABLE)
          .sort((first, second) => new Date(second.created_at) - new Date(first.created_at))
          .slice(0, limitCount)) : unwrap(await supabase.from(TABLE).select(COLUMNS)
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(limitCount));
        if (!active || currentRequest !== request) return;
        invalidateCache();
        if (!vault) writeOffline(cacheId, rows);
        onUpdate(normalizeRows(rows, onInvalid), []);
      } catch (error) {
        if (!active || currentRequest !== request) return;
        // Offline: show the last copy instead of an empty dashboard.
        const cached = !vault && readOffline(cacheId);
        if (Array.isArray(cached)) {
          onUpdate(normalizeRows(cached, onInvalid), []);
          return;
        }
        onError?.(error);
      }
    };
    const stop = vault ? vault.watch(reload) : watchTable({ supabase, table: TABLE, userId, reload });
    return () => { active = false; stop(); };
  },

  fetchRange: async (userId, options = {}) => {
    const vault = currentVault(userId);
    if (vault) return readVaultTransactions(vault, options);
    const {
      forceRefresh = false,
      ttlMs = DEFAULT_TTL_MS,
      onRevalidated,
      revalidateIfFresh = false,
      onInvalid,
      type = "all",
      startDate,
      endDate,
    } = options;
    const key = queryKey({ userId, type, startDate, endDate });
    const cached = dataCache.get(key);
    const isFresh = cached && Date.now() - cached.cachedAt < ttlMs;

    const load = () => dedupe(`range:${key}`, async () => {
      const revision = cacheRevision;
      const rows = await selectAll({ userId, type, startDate, endDate });
      if (revision !== cacheRevision) return load();
      const data = normalizeRows(rows, onInvalid);
      dataCache.set(key, { data, cachedAt: Date.now() });
      return data;
    });

    if (!forceRefresh && isFresh) {
      if (revalidateIfFresh) load().then((data) => onRevalidated?.(data)).catch(() => {});
      return cached.data;
    }
    return load();
  },

  fetchAll: (userId, options = {}) => TransactionService.fetchRange(userId, options),

  /** Keyset pagination, with date and id as deterministic tie breakers. The cursor is the last row returned. */
  fetchPage: async (userId, { pageSize = DEFAULT_PAGE_SIZE, cursor = null, onInvalid, type = "all", category = "all", sortBy = "date-desc", startDate, endDate } = {}) => {
    const byAmount = sortBy === "amount-asc" || sortBy === "amount-desc";

    if (cursor !== null) {
      if (!isDateKey(cursor?.dateKey)) throw Object.assign(new Error("Invalid cursor date"), { code: "invalid-argument" });
      cursorId(cursor.id);
      if (byAmount && (!Number.isSafeInteger(cursor.amountMinor) || cursor.amountMinor <= 0)) {
        throw Object.assign(new Error("Invalid cursor amount"), { code: "invalid-argument" });
      }
    }
    const vault = currentVault(userId);
    if (vault) {
      const rows = await readVaultTransactions(vault, { type, category, sortBy, startDate, endDate, onInvalid });
      const compare = transactionComparator(sortBy);
      const boundary = cursor && { ...cursor, date: dateKeyToDate(cursor.dateKey), amount: byAmount ? minorToMajor(cursor.amountMinor) : undefined };
      const items = (boundary ? rows.filter((row) => compare(row, boundary) > 0) : rows).slice(0, pageSize);
      const last = items.at(-1);
      return {
        items,
        nextCursor: last ? { dateKey: last.dateKey, id: last.id, ...(byAmount && { amountMinor: last.amountMinor }) } : null,
        hasMore: items.length === pageSize,
      };
    }
    let query = applyFilters(supabase.from(TABLE).select(COLUMNS), { userId, type, category, startDate, endDate });
    if (byAmount) query = query.order("amount_minor", { ascending: sortBy === "amount-asc" });
    query = orderNewestFirst(query);
    if (cursor !== null) {
      const { dateKey, id } = cursor;
      const older = `date_key.lt.${dateKey},and(date_key.eq.${dateKey},id.lt.${id})`;
      if (byAmount) {
        const amount = cursor.amountMinor;
        const op = sortBy === "amount-asc" ? "gt" : "lt";
        query = query.or(`amount_minor.${op}.${amount},and(amount_minor.eq.${amount},or(${older}))`);
      } else {
        query = query.or(older);
      }
    }
    const rows = unwrap(await query.limit(pageSize));
    const last = rows.at(-1);
    return {
      items: normalizeRows(rows, onInvalid, transactionComparator(sortBy)),
      nextCursor: last ? { dateKey: String(last.date_key).slice(0, 10), id: last.id, ...(byAmount && { amountMinor: Number(last.amount_minor) }) } : null,
      hasMore: rows.length === pageSize,
    };
  },

  /**
   * Count and sums for the complete filtered period, so the summary is
   * right even when only the first page is loaded.
   */
  getTotals: async (userId, options = {}) => {
    const vault = currentVault(userId);
    if (vault) return computeOfflineTotals(await readVaultTransactions(vault, options), []);
    const { forceRefresh = false, ttlMs = DEFAULT_TTL_MS, type = "all", category = "all", startDate, endDate } = options;
    const key = queryKey({ userId, type, category, startDate, endDate });
    const cached = totalsCache.get(key);
    if (!forceRefresh && cached && Date.now() - cached.cachedAt < ttlMs) return cached.totals;

    const load = () => dedupe(`totals:${key}`, async () => {
      const revision = cacheRevision;
      let totals;
      if (category === "all") {
        const rows = unwrap(await supabase.rpc("transaction_totals", {
          p_type: type,
          p_start: startDate ? coerceDateKey(startDate) : null,
          p_end: endDate ? coerceDateKey(endDate) : null,
        }));
        const row = (Array.isArray(rows) ? rows[0] : rows) || {};
        totals = { count: Number(row.count || 0), incomeMinor: Number(row.income_minor || 0), expenseMinor: Number(row.expense_minor || 0) };
      } else {
        // The installed totals RPC has no category argument. Read only the
        // two accounting columns, including matches beyond the first page.
        const rows = await selectAll({ userId, type, category, startDate, endDate }, "type,amount_minor");
        totals = { count: rows.length, incomeMinor: 0, expenseMinor: 0 };
        for (const row of rows) {
          if (row.type === "income") totals.incomeMinor += Number(row.amount_minor);
          else totals.expenseMinor += Number(row.amount_minor);
        }
      }
      if (revision !== cacheRevision) return load();
      totalsCache.set(key, { totals, cachedAt: Date.now() });
      return totals;
    });
    return load();
  },

  getTotalCount: async (userId, options = {}) => {
    const vault = currentVault(userId);
    if (vault) return (await readVaultTransactions(vault, options)).length;
    const { forceRefresh = false, ttlMs = DEFAULT_TTL_MS, type = "all", category = "all", startDate, endDate } = options;
    const key = queryKey({ userId, type, category, startDate, endDate });
    const cached = countCache.get(key);
    if (!forceRefresh && cached && Date.now() - cached.cachedAt < ttlMs) return cached.count;

    const load = () => dedupe(`count:${key}`, async () => {
      const revision = cacheRevision;
      const response = await applyFilters(
        supabase.from(TABLE).select("id", { count: "exact", head: true }),
        { userId, type, category, startDate, endDate }
      );
      if (response.error) throw toDataError(response.error);
      if (revision !== cacheRevision) return load();
      const count = response.count || 0;
      countCache.set(key, { count, cachedAt: Date.now() });
      return count;
    });
    return load();
  },

  /** Number of transactions per category, computed by the database. */
  countByCategory: async (userId, categories) => {
    const vault = currentVault(userId);
    if (vault) {
      const counts = new Map();
      for (const row of await readVaultTransactions(vault)) counts.set(row.category, (counts.get(row.category) || 0) + 1);
      return Object.fromEntries(categories.map((category) => [category, counts.get(category) || 0]));
    }
    const rows = unwrap(await supabase.rpc("transaction_category_counts"));
    const counts = new Map((rows || []).map((row) => [row.category, Number(row.count)]));
    return Object.fromEntries(categories.map((category) => [category, counts.get(category) || 0]));
  },

  /** Date of the oldest transaction, or null when there is none. */
  getFirstDate: async (userId) => {
    const vault = currentVault(userId);
    if (vault) return (await readVaultTransactions(vault)).at(-1)?.date ?? null;
    const rows = unwrap(await supabase.from(TABLE).select("date_key")
      .eq("user_id", userId)
      .order("date_key", { ascending: true })
      .limit(1));
    return rows.length ? dateKeyToDate(String(rows[0].date_key).slice(0, 10)) : null;
  },

  add: async (userId, data, { requestId = crypto.randomUUID() } = {}) => {
    const input = toV2Input(data);
    const id = `${safeId(userId)}_${safeId(requestId)}`;
    const vault = currentVault(userId);
    if (vault) {
      const fields = toTransactionRow(input);
      const rule = data.recurring && recurringDraftSchema.parse(data.recurring);
      return vault.change(({ get }) => {
        const changes = [];
        if (!get(TABLE, id)) changes.push(transactionRecord(id, userId, fields));
        if (rule && !get("recurring", rule.id)) {
          const { date_key: anchor_date_key, ...details } = fields;
          const created_at = new Date().toISOString();
          changes.push(vaultRecord("recurring", rule.id, {
            ...details, id: rule.id, user_id: userId, created_at, updated_at: created_at,
            anchor_date_key, frequency: rule.frequency, mode: rule.mode, next_index: 1, paused: false,
          }));
        }
        return { changes, result: { id } };
      });
    }

    if (data.recurring) {
      const rule = recurringDraftSchema.parse(data.recurring);
      unwrap(await supabase.rpc("add_transaction_with_recurring", {
        p_id: id, p_rule_id: rule.id, p_transaction: toTransactionRow(input),
        p_frequency: rule.frequency, p_mode: rule.mode,
      }));
      afterWrite();
      emitLocalChange("recurring");
      return { id };
    }
    const { error } = await supabase.from(TABLE).insert({ id, user_id: userId, ...toTransactionRow(input), schema_version: 2 });
    // A retry reuses the same id. If the first attempt actually reached the
    // server the row is already there: confirm that instead of failing.
    if (error && !(error.code === "23505" && await isAlreadyCreated(id))) throw toDataError(error);
    afterWrite();
    return { id };
  },

  /** Bulk idempotent insert for CSV imports (chunks of 100 rows, one cache invalidation). */
  addBatch: async (userId, items = [], { chunkSize = 100, onProgress } = {}) => {
    if (!items.length) return { imported: 0, failed: [] };
    const vault = currentVault(userId);
    const failed = [];
    let imported = 0;
    for (let offset = 0; offset < items.length; offset += chunkSize) {
      const slice = items.slice(offset, offset + chunkSize);
      const rows = [];
      const validSlice = [];
      for (const item of slice) {
        try {
          const input = toV2Input(item);
          const id = `${safeId(userId)}_${safeId(item.clientRequestId || crypto.randomUUID())}`;
          rows.push({ id, user_id: userId, ...toTransactionRow(input), schema_version: 2 });
          validSlice.push(item);
        } catch {
          failed.push(item);
        }
      }
      if (rows.length) {
        const { error } = vault ? await vault.change(({ get }) => {
          const unique = new Map(rows.map((row) => [row.id, row]));
          return {
            changes: [...unique.values()].filter((row) => !get(TABLE, row.id))
              .map((row) => transactionRecord(row.id, userId, row)),
            result: {},
          };
        }).catch((error) => ({ error })) : await supabase.from(TABLE).upsert(rows, { onConflict: "id", ignoreDuplicates: true });
        if (error) {
          failed.push(...validSlice);
        } else {
          imported += rows.length;
        }
      }
      onProgress?.(Math.min(100, Math.round(((offset + slice.length) / items.length) * 100)));
    }
    if (imported > 0) afterWrite();
    return { imported, failed };
  },

  update: async (id, data) => {
    const rawPatch = {};
    if (data.amount !== undefined || data.amountMinor !== undefined) {
      rawPatch.amountMinor = Number.isSafeInteger(data.amountMinor) ? data.amountMinor : parseMoneyToMinor(data.amount);
    }
    if (data.currency !== undefined) rawPatch.currency = data.currency;
    if (data.description !== undefined) rawPatch.description = data.description;
    if (data.date !== undefined || data.dateKey !== undefined) rawPatch.dateKey = data.dateKey || coerceDateKey(data.date);
    if (data.category !== undefined) rawPatch.category = data.category;
    if (data.type !== undefined) rawPatch.type = data.type;
    const patch = transactionV2PatchSchema.parse(rawPatch);
    const vault = currentVault();
    if (vault) return vault.change(({ get }) => {
      const current = get(TABLE, id);
      if (!current) throw notFound();
      return { changes: [transactionRecord(id, vault.uid, { ...current, ...toTransactionRow(patch), updated_at: new Date().toISOString() })] };
    });

    const rows = unwrap(await supabase.from(TABLE).update({ ...toTransactionRow(patch), schema_version: 2 }).eq("id", id).select("id"));
    if (!rows.length) throw notFound();
    afterWrite();
  },

  delete: async (id) => {
    const vault = currentVault();
    if (vault) return vault.change(({ get }) => {
      if (!get(TABLE, id)) throw notFound();
      return { changes: [vaultRecord(TABLE, id, null)] };
    });
    const rows = unwrap(await supabase.from(TABLE).delete().eq("id", id).select("id"));
    if (!rows.length) throw notFound();
    afterWrite();
  },

  invalidateCache,
  normalizeRow,
  toV2Input,
  DEFAULT_TTL_MS,
  DEFAULT_PAGE_SIZE,
};
