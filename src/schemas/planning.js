import { z } from "zod";
import { MAX_AMOUNT_MINOR } from "../utils/money";
import { isDateKey } from "../utils/dateUtils";

export const recurringDraftSchema = z.object({
  id: z.uuid(),
  frequency: z.enum(["weekly", "monthly", "yearly"]),
  mode: z.enum(["auto", "confirm"]),
});

export const recurringInputSchema = z.object({
  type: z.enum(["income", "expense"]),
  amountMinor: z.number().int().positive().max(MAX_AMOUNT_MINOR),
  currency: z.literal("EUR"),
  description: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(60),
  frequency: z.enum(["weekly", "monthly", "yearly"]),
  anchorDateKey: z.string().refine(isDateKey, "Invalid date key"),
  nextIndex: z.number().int().min(0).max(10000),
  mode: z.enum(["auto", "confirm"]),
  paused: z.boolean(),
});

export const recurringPatchSchema = recurringInputSchema
  .pick({ nextIndex: true, paused: true, mode: true, amountMinor: true })
  .partial();

/** Category -> monthly limit in cents. Zero or missing means "no budget". */
export const budgetLimitsSchema = z.record(
  z.string().min(1).max(60),
  z.number().int().positive().max(MAX_AMOUNT_MINOR)
).refine((limits) => Object.keys(limits).length <= 40, "Too many budgets");

export const DEFAULT_QUICK_AMOUNTS = Object.freeze([5, 10, 20, 50, 100]);

/** Per-user settings synced across devices. */
export const preferencesSchema = z.object({
  monthStartDay: z.number().int().min(1).max(31),
  defaultType: z.enum(["last", "expense", "income"]),
  defaultCategory: z.string().max(60).nullable(),
  quickAmounts: z.array(z.number().int().positive().max(100000)).min(1).max(6),
  hiddenCategories: z.array(z.string().min(1).max(60)).max(40),
  categoryOrder: z.object({
    expense: z.array(z.string().min(1).max(60)).max(40),
    income: z.array(z.string().min(1).max(60)).max(40),
  }),
  lastBackupAt: z.number().int().nonnegative().nullable(),
});

export const DEFAULT_PREFERENCES = Object.freeze({
  monthStartDay: 1,
  defaultType: "last",
  defaultCategory: null,
  quickAmounts: [...DEFAULT_QUICK_AMOUNTS],
  hiddenCategories: [],
  categoryOrder: { expense: [], income: [] },
  lastBackupAt: null,
});

/** Stored data merged over the defaults; anything invalid falls back. */
export const normalizePreferences = (raw = {}) => {
  const merged = { ...DEFAULT_PREFERENCES, ...(raw || {}) };
  merged.categoryOrder = { ...DEFAULT_PREFERENCES.categoryOrder, ...(raw?.categoryOrder || {}) };
  const parsed = preferencesSchema.safeParse(merged);
  if (parsed.success) return parsed.data;
  const result = { ...DEFAULT_PREFERENCES };
  for (const key of Object.keys(DEFAULT_PREFERENCES)) {
    const single = preferencesSchema.shape[key].safeParse(merged[key]);
    if (single.success) result[key] = single.data;
  }
  return result;
};
