import { supabase, toDataError, unwrap } from "../utils/supabaseClient.js";
import { emitLocalChange, watchTable } from "./changeEvents.js";
import { transactionV2InputSchema, transactionV2PatchSchema } from "../schemas/transaction.jsx";
import { DEFAULT_CURRENCY, minorToMajor, parseMoneyToMinor } from "../utils/money.js";
import { compareTransactions } from "../utils/transactionOrder.js";
import { coerceDateKey, dateKeyToDate, isDateKey } from "../utils/dateUtils.js";
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

const normalizeRows = (rows, onInvalid) => rows.flatMap((row) => {
  try {
    return [normalizeRow(row)];
  } catch (error) {
    onInvalid?.({ id: row.id, code: "invalid-transaction", error });
    return [];
  }
}).sort(compareTransactions);

const applyFilters = (builder, { userId, type = "all", startDate, endDate }) => {
  let query = builder.eq("user_id", userId);
  if (type !== "all") query = query.eq("type", type);
  if (startDate) query = query.gte("date_key", coerceDateKey(startDate));
  if (endDate) query = query.lte("date_key", coerceDateKey(endDate));
  return query;
};

const orderNewestFirst = (query) => query.order("date_key", { ascending: false }).order("id", { ascending: false });

const queryKey = ({ userId, type = "all", startDate, endDate }) => [
  userId,
  type,
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
const selectAll = async (filters) => {
  const rows = [];
  for (let from = 0; ; from += BATCH_SIZE) {
    const batch = unwrap(await orderNewestFirst(applyFilters(supabase.from(TABLE).select(COLUMNS), filters))
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

const toRow = (input) => {
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

export const TransactionService = {
  /** The most recently created transactions, kept current while subscribed. */
  subscribeToRecent: (userId, limitCount, onUpdate, onError, onInvalid) => {
    let active = true;
    let request = 0;
    const reload = async () => {
      const currentRequest = ++request;
      try {
        const rows = unwrap(await supabase.from(TABLE).select(COLUMNS)
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(limitCount));
        if (!active || currentRequest !== request) return;
        invalidateCache();
        onUpdate(normalizeRows(rows, onInvalid), []);
      } catch (error) {
        if (active && currentRequest === request) onError?.(error);
      }
    };
    const stop = watchTable({ supabase, table: TABLE, userId, reload });
    return () => { active = false; stop(); };
  },

  fetchRange: async (userId, options = {}) => {
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

  /** Keyset pagination, newest first. The cursor is the last row returned. */
  fetchPage: async (userId, { pageSize = DEFAULT_PAGE_SIZE, cursor = null, onInvalid, type = "all", startDate, endDate } = {}) => {
    let query = orderNewestFirst(applyFilters(supabase.from(TABLE).select(COLUMNS), { userId, type, startDate, endDate }));
    if (cursor !== null) {
      if (!isDateKey(cursor?.dateKey)) throw Object.assign(new Error("Invalid cursor date"), { code: "invalid-argument" });
      const dateKey = cursor.dateKey;
      const id = cursorId(cursor.id);
      query = query.or(`date_key.lt.${dateKey},and(date_key.eq.${dateKey},id.lt.${id})`);
    }
    const rows = unwrap(await query.limit(pageSize));
    const last = rows.at(-1);
    return {
      items: normalizeRows(rows, onInvalid),
      nextCursor: last ? { dateKey: String(last.date_key).slice(0, 10), id: last.id } : null,
      hasMore: rows.length === pageSize,
    };
  },

  /**
   * Count and sums for a period computed by the database, so the summary is
   * right even when only the first page is loaded.
   */
  getTotals: async (userId, options = {}) => {
    const { forceRefresh = false, ttlMs = DEFAULT_TTL_MS, type = "all", startDate, endDate } = options;
    const key = queryKey({ userId, type, startDate, endDate });
    const cached = totalsCache.get(key);
    if (!forceRefresh && cached && Date.now() - cached.cachedAt < ttlMs) return cached.totals;

    const load = () => dedupe(`totals:${key}`, async () => {
      const revision = cacheRevision;
      const rows = unwrap(await supabase.rpc("transaction_totals", {
        p_type: type,
        p_start: startDate ? coerceDateKey(startDate) : null,
        p_end: endDate ? coerceDateKey(endDate) : null,
      }));
      if (revision !== cacheRevision) return load();
      const row = (Array.isArray(rows) ? rows[0] : rows) || {};
      const totals = {
        count: Number(row.count || 0),
        incomeMinor: Number(row.income_minor || 0),
        expenseMinor: Number(row.expense_minor || 0),
      };
      totalsCache.set(key, { totals, cachedAt: Date.now() });
      return totals;
    });
    return load();
  },

  getTotalCount: async (userId, options = {}) => {
    const { forceRefresh = false, ttlMs = DEFAULT_TTL_MS, type = "all", startDate, endDate } = options;
    const key = queryKey({ userId, type, startDate, endDate });
    const cached = countCache.get(key);
    if (!forceRefresh && cached && Date.now() - cached.cachedAt < ttlMs) return cached.count;

    const load = () => dedupe(`count:${key}`, async () => {
      const revision = cacheRevision;
      const response = await applyFilters(
        supabase.from(TABLE).select("id", { count: "exact", head: true }),
        { userId, type, startDate, endDate }
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
  countByCategory: async (_userId, categories) => {
    const rows = unwrap(await supabase.rpc("transaction_category_counts"));
    const counts = new Map((rows || []).map((row) => [row.category, Number(row.count)]));
    return Object.fromEntries(categories.map((category) => [category, counts.get(category) || 0]));
  },

  /** Date of the oldest transaction, or null when there is none. */
  getFirstDate: async (userId) => {
    const rows = unwrap(await supabase.from(TABLE).select("date_key")
      .eq("user_id", userId)
      .order("date_key", { ascending: true })
      .limit(1));
    return rows.length ? dateKeyToDate(String(rows[0].date_key).slice(0, 10)) : null;
  },

  add: async (userId, data, { requestId = crypto.randomUUID() } = {}) => {
    const input = toV2Input(data);
    const id = `${safeId(userId)}_${safeId(requestId)}`;
    if (data.recurring) {
      const rule = recurringDraftSchema.parse(data.recurring);
      unwrap(await supabase.rpc("add_transaction_with_recurring", {
        p_id: id, p_rule_id: rule.id, p_transaction: toRow(input),
        p_frequency: rule.frequency, p_mode: rule.mode,
      }));
      afterWrite();
      emitLocalChange("recurring");
      return { id };
    }
    const { error } = await supabase.from(TABLE).insert({ id, user_id: userId, ...toRow(input), schema_version: 2 });
    // A retry reuses the same id. If the first attempt actually reached the
    // server the row is already there: confirm that instead of failing.
    if (error && !(error.code === "23505" && await isAlreadyCreated(id))) throw toDataError(error);
    afterWrite();
    return { id };
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

    const rows = unwrap(await supabase.from(TABLE).update({ ...toRow(patch), schema_version: 2 }).eq("id", id).select("id"));
    if (!rows.length) throw notFound();
    afterWrite();
  },

  delete: async (id) => {
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
