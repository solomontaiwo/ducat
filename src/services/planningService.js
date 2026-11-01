import { supabase, unwrap } from "../utils/supabaseClient.js";
import { emitLocalChange, watchTable } from "./changeEvents.js";
import { readOffline, writeOffline } from "../utils/offlineCache.js";
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

const toRecurringRow = (data) => Object.fromEntries(
  Object.entries(data)
    .filter(([key, value]) => RECURRING_COLUMNS[key] && value !== undefined)
    .map(([key, value]) => [RECURRING_COLUMNS[key], value])
);

const subscribe = (table, userId, load, onData, onError) => {
  const cacheId = `${table}:${userId}`;
  let active = true;
  let request = 0;
  const reload = async () => {
    const currentRequest = ++request;
    try {
      const data = await load();
      writeOffline(cacheId, data);
      if (active && request === currentRequest) onData(data);
    } catch (error) {
      if (!active || request !== currentRequest) return;
      // Offline: keep budgets, recurring rules and preferences usable.
      const cached = readOffline(cacheId);
      if (cached !== null && cached !== undefined) {
        onData(cached);
        return;
      }
      onError?.(error);
    }
  };
  const stop = watchTable({ supabase, table, userId, reload });
  return () => { active = false; stop(); };
};

/** Recurring rules, monthly budgets and synced preferences. */
export const PlanningService = {
  subscribeRecurring: (userId, onData, onError) => subscribe(RECURRING, userId, async () => {
    const rows = unwrap(await supabase.from(RECURRING).select("*").eq("user_id", userId).order("created_at"));
    return rows.map(fromRecurringRow);
  }, onData, onError),

  addRecurring: async (userId, data) => {
    const input = recurringInputSchema.parse(data);
    const row = unwrap(await supabase.from(RECURRING)
      .insert({ ...toRecurringRow(input), user_id: userId })
      .select("id")
      .single());
    emitLocalChange(RECURRING);
    return row.id;
  },

  updateRecurring: async (id, patch) => {
    const parsed = recurringPatchSchema.parse(patch);
    unwrap(await supabase.from(RECURRING).update(toRecurringRow(parsed)).eq("id", id));
    emitLocalChange(RECURRING);
  },

  deleteRecurring: async (id) => {
    unwrap(await supabase.from(RECURRING).delete().eq("id", id));
    emitLocalChange(RECURRING);
  },

  subscribeBudgets: (userId, onData, onError) => subscribe(BUDGETS, userId, async () => {
    const row = unwrap(await supabase.from(BUDGETS).select("limits").eq("user_id", userId).maybeSingle());
    return row?.limits || {};
  }, onData, onError),

  subscribePreferences: (userId, onData, onError) => subscribe(PREFERENCES, userId, async () => {
    const row = unwrap(await supabase.from(PREFERENCES).select("data").eq("user_id", userId).maybeSingle());
    return row ? row.data : null;
  }, onData, onError),

  savePreferences: async (userId, preferences) => {
    const parsed = preferencesSchema.partial().parse(preferences);
    const saved = unwrap(await supabase.rpc("save_preferences_patch", { p_patch: parsed }));
    emitLocalChange(PREFERENCES);
    return saved;
  },

  registerOccurrence: async (id, index) => {
    const created = unwrap(await supabase.rpc("register_recurring_occurrence", { p_rule_id: id, p_index: index }));
    emitLocalChange(RECURRING);
    emitLocalChange("transactions");
    return Boolean(created);
  },

  saveBudgets: async (userId, limits) => {
    const parsed = budgetLimitsSchema.parse(limits);
    unwrap(await supabase.from(BUDGETS).upsert({ user_id: userId, limits: parsed }, { onConflict: "user_id" }));
    emitLocalChange(BUDGETS);
  },
};
