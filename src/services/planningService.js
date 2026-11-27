import { supabase, unwrap } from "../utils/supabaseClient.js";
import { emitLocalChange, watchTable } from "./changeEvents.js";
import { readOffline, writeOffline } from "../utils/offlineCache.js";
import { currentVault, vaultRecord } from "./vaultSession.js";
import { occurrenceDateKey, occurrenceRequestId } from "../utils/recurrence.js";
import { transactionRecord } from "./transactionService.jsx";
import { budgetLimitsSchema, preferencesSchema, recurringInputSchema, recurringPatchSchema } from "../schemas/planning.js";

const RECURRING = "recurring";
const BUDGETS = "budgets";
const PREFERENCES = "preferences";

export const fromRecurringRow = (row) => ({
  id: row.id,
  userId: row.user_id,
  type: row.type,
  amountMinor: Number(row.amount_minor),
  currency: row.currency,
  description: row.description,
  category: row.category,
  frequency: row.frequency,
  anchorDateKey: String(row.anchor_date_key).slice(0, 10),
  nextIndex: row.next_index,
  mode: row.mode,
  paused: row.paused,
});

const RECURRING_COLUMNS = {
  type: "type",
  amountMinor: "amount_minor",
  currency: "currency",
  description: "description",
  category: "category",
  frequency: "frequency",
  anchorDateKey: "anchor_date_key",
  nextIndex: "next_index",
  mode: "mode",
  paused: "paused",
};

export const toRecurringRow = (data) => Object.fromEntries(
  Object.entries(data)
    .filter(([key, value]) => RECURRING_COLUMNS[key] && value !== undefined)
    .map(([key, value]) => [RECURRING_COLUMNS[key], value])
);

const subscribe = (table, userId, load, onData, onError) => {
  const vault = currentVault(userId);
  const cacheId = `${table}:${userId}`;
  let active = true;
  let request = 0;
  const reload = async () => {
    const currentRequest = ++request;
    try {
      const data = await load();
      if (!vault) writeOffline(cacheId, data);
      if (active && request === currentRequest) onData(data);
    } catch (error) {
      if (!active || request !== currentRequest) return;
      // Offline: keep budgets, recurring rules and preferences usable.
      const cached = !vault ? readOffline(cacheId) : null;
      if (cached !== null && cached !== undefined) {
        onData(cached);
        return;
      }
      onError?.(error);
    }
  };
  const stop = vault ? vault.watch(reload) : watchTable({ supabase, table, userId, reload });
  return () => { active = false; stop(); };
};

export const registerEncryptedOccurrence = (vault, id, index) => vault.change(({ get }) => {
  const row = get(RECURRING, id);
  if (!row) throw new Error("Recurring rule unavailable");
  if (!Number.isInteger(index) || index < 0 || index >= 10000) throw new Error("Invalid occurrence index");
  if (index < row.next_index) return { changes: [], result: false };
  if (row.paused || index !== row.next_index) throw new Error("Recurring rule changed");
  const { type, amount_minor, currency, description, category } = row;
  const date_key = occurrenceDateKey(row.anchor_date_key, row.frequency, index);
  const transactionId = `${vault.uid}_${occurrenceRequestId(id, date_key)}`;
  const result = !get("transactions", transactionId);
  const changes = [vaultRecord(RECURRING, id, { ...row, next_index: index + 1, updated_at: new Date().toISOString() })];
  if (result) changes.push(transactionRecord(transactionId, vault.uid, { type, amount_minor, currency, description, category, date_key }));
  return { changes, result };
});

/** Recurring rules, monthly budgets and synced preferences. */
export const PlanningService = {
  subscribeRecurring: (userId, onData, onError) => subscribe(RECURRING, userId, async () => {
    const vault = currentVault(userId);
    const rows = vault ? await vault.read(({ list }) => list(RECURRING)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || a.id.localeCompare(b.id)))
      : unwrap(await supabase.from(RECURRING).select("*").eq("user_id", userId).order("created_at"));
    return rows.map(fromRecurringRow);
  }, onData, onError),

  addRecurring: async (userId, data) => {
    const input = recurringInputSchema.parse(data);
    const vault = currentVault(userId);
    if (vault) {
      const id = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      return vault.change(() => ({
        changes: [vaultRecord(RECURRING, id, { ...toRecurringRow(input), id, user_id: userId, created_at: timestamp, updated_at: timestamp })],
        result: id,
      }));
    }
    const row = unwrap(await supabase.from(RECURRING)
      .insert({ ...toRecurringRow(input), user_id: userId })
      .select("id")
      .single());
    emitLocalChange(RECURRING);
    return row.id;
  },

  updateRecurring: async (id, patch) => {
    const parsed = recurringPatchSchema.parse(patch);
    const vault = currentVault();
    if (vault) return vault.change(({ get }) => {
      const rule = get(RECURRING, id);
      if (!rule) return { changes: [] };
      return { changes: [vaultRecord(RECURRING, id, {
        ...rule, ...toRecurringRow(parsed), next_index: Math.max(rule.next_index, parsed.nextIndex ?? 0), updated_at: new Date().toISOString(),
      })] };
    });
    unwrap(await supabase.from(RECURRING).update(toRecurringRow(parsed)).eq("id", id));
    emitLocalChange(RECURRING);
  },

  deleteRecurring: async (id) => {
    const vault = currentVault();
    if (vault) return vault.change(({ get }) => ({ changes: get(RECURRING, id) ? [vaultRecord(RECURRING, id, null)] : [] }));
    unwrap(await supabase.from(RECURRING).delete().eq("id", id));
    emitLocalChange(RECURRING);
  },

  subscribeBudgets: (userId, onData, onError) => subscribe(BUDGETS, userId, async () => {
    const vault = currentVault(userId);
    if (vault) return vault.read(({ get }) => get(BUDGETS, "settings") || {});
    const row = unwrap(await supabase.from(BUDGETS).select("limits").eq("user_id", userId).maybeSingle());
    return row?.limits || {};
  }, onData, onError),

  subscribePreferences: (userId, onData, onError) => subscribe(PREFERENCES, userId, async () => {
    const vault = currentVault(userId);
    if (vault) return vault.read(({ get }) => get(PREFERENCES, "settings") || null);
    const row = unwrap(await supabase.from(PREFERENCES).select("data").eq("user_id", userId).maybeSingle());
    return row ? row.data : null;
  }, onData, onError),

  savePreferences: async (userId, preferences) => {
    const parsed = preferencesSchema.partial().parse(preferences);
    const vault = currentVault(userId);
    if (vault) return vault.change(({ get }) => {
      const result = { ...get(PREFERENCES, "settings"), ...parsed };
      return { changes: [vaultRecord(PREFERENCES, "settings", result)], result };
    });
    const saved = unwrap(await supabase.rpc("save_preferences_patch", { p_patch: parsed }));
    emitLocalChange(PREFERENCES);
    return saved;
  },

  registerOccurrence: async (id, index) => {
    const vault = currentVault();
    if (vault) return registerEncryptedOccurrence(vault, id, index);
    const created = unwrap(await supabase.rpc("register_recurring_occurrence", { p_rule_id: id, p_index: index }));
    emitLocalChange(RECURRING);
    emitLocalChange("transactions");
    return Boolean(created);
  },

  saveBudgets: async (userId, limits) => {
    const parsed = budgetLimitsSchema.parse(limits);
    const vault = currentVault(userId);
    if (vault) return vault.change(() => ({ changes: [vaultRecord(BUDGETS, "settings", parsed)] }));
    unwrap(await supabase.from(BUDGETS).upsert({ user_id: userId, limits: parsed }, { onConflict: "user_id" }));
    emitLocalChange(BUDGETS);
  },
};
