import { supabase, unwrap } from "../utils/supabaseClient.js";
import { buildAccountExport, parseAccountBackup } from "../utils/accountExport.js";
import { TransactionService } from "./transactionService.jsx";
import { fromRecurringRow } from "./planningService.js";
import { budgetLimitsSchema, normalizePreferences } from "../schemas/planning.js";
import { emitLocalChange } from "./changeEvents.js";

const assertVerified = (user) => {
  if (!user?.uid || !user.emailVerified) throw new Error("Verified account required");
};

export const BackupService = {
  fetch: async (user, profileName) => {
    assertVerified(user);
    const snapshot = unwrap(await supabase.rpc("read_account_backup"));
    // Legacy or partially invalid settings must not make the whole backup fail.
    const storedBudgets = budgetLimitsSchema.safeParse(snapshot.budgets);
    const payload = buildAccountExport({
      user, profileName,
      transactions: snapshot.transactions.map(TransactionService.normalizeRow),
      recurring: snapshot.recurring.map(fromRecurringRow),
      budgets: storedBudgets.success ? storedBudgets.data : {},
      preferences: normalizePreferences(snapshot.preferences),
    });
    parseAccountBackup(payload, user.uid);
    return payload;
  },

  restore: async (user, raw, { restoreSettings = false } = {}) => {
    assertVerified(user);
    const backup = parseAccountBackup(raw, user.uid);
    const result = unwrap(await supabase.rpc("restore_account_backup", {
      p_backup: backup, p_restore_settings: restoreSettings,
    }));
    TransactionService.invalidateCache();
    for (const topic of ["transactions", "recurring", "budgets", "preferences"]) emitLocalChange(topic);
    return result;
  },
};
