import { saveFile } from "./saveFile.js";
import { getTransactionAmountMinor, minorToMajor } from "./money.js";
import { coerceDateKey } from "./dateUtils.js";
import { z } from "zod";
import { transactionV2InputSchema } from "../schemas/transaction.jsx";
import { DEFAULT_PREFERENCES, budgetLimitsSchema, preferencesSchema, recurringInputSchema } from "../schemas/planning.js";

const backupSchema = z.object({
  schemaVersion: z.literal(2),
  account: z.object({ uid: z.string().min(1) }),
  transactions: z.array(transactionV2InputSchema.extend({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),
  })).max(100000),
  recurring: z.array(recurringInputSchema.extend({ id: z.uuid() })).max(10000).default([]),
  budgets: budgetLimitsSchema.default({}),
  preferences: preferencesSchema.partial().nullable().default(null),
});

/** Validate before writing: a backup can only be restored into its original account. */
export const parseAccountBackup = (raw, userId) => {
  const parsed = backupSchema.parse(typeof raw === "string" ? JSON.parse(raw) : raw);
  if (parsed.account.uid !== userId) throw Object.assign(new Error("Backup belongs to another account"), { code: "backup/wrong-account" });
  for (const rows of [parsed.transactions, parsed.recurring]) {
    if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error("Duplicate backup ids");
  }
  parsed.preferences = preferencesSchema.parse({ ...DEFAULT_PREFERENCES, ...parsed.preferences });
  return parsed;
};

export const buildAccountExport = ({ user, profileName, transactions, recurring = [], budgets = {}, preferences = null, exportedAt = new Date() }) => ({
  schemaVersion: 2,
  exportedAt: exportedAt.toISOString(),
  account: {
    uid: user.uid,
    email: user.email || null,
    displayName: profileName || user.displayName || null,
    emailVerified: Boolean(user.emailVerified),
    createdAt: user.metadata?.creationTime || null,
  },
  recurring: recurring.map(({ id, type, amountMinor, currency, description, category, frequency, anchorDateKey, nextIndex, mode, paused }) => ({
    id, type, amountMinor, currency, description, category, frequency, anchorDateKey, nextIndex, mode, paused,
  })),
  budgets,
  preferences,
  transactions: transactions.map((transaction) => {
    const amountMinor = getTransactionAmountMinor(transaction);
    return {
      id: transaction.id,
      amountMinor,
      amount: minorToMajor(amountMinor),
      currency: transaction.currency || "EUR",
      description: transaction.description,
      dateKey: transaction.dateKey || coerceDateKey(transaction.date),
      category: transaction.category,
      type: transaction.type,
      schemaVersion: transaction.schemaVersion || 1,
    };
  }),
});

export const downloadJson = (value, filename) => {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
  return saveFile(blob, filename);
};
