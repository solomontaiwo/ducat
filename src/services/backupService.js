import { supabase, unwrap } from "../utils/supabaseClient.js";
import { buildAccountExport, parseAccountBackup } from "../utils/accountExport.js";
import { TransactionService, toTransactionRow, transactionRecord } from "./transactionService.jsx";
import { fromRecurringRow, toRecurringRow } from "./planningService.js";
import { budgetLimitsSchema, normalizePreferences } from "../schemas/planning.js";
import { currentVault, vaultRecord } from "./vaultSession.js";
import { emitLocalChange } from "./changeEvents.js";

const assertVerified = (user) => {
  if (!user?.uid || !user.emailVerified) throw new Error("Verified account required");
};

export const BackupService = {
  fetch: async (user, profileName) => {
    assertVerified(user);
    const vault = currentVault(user.uid);
    const snapshot = vault ? await vault.read(({ list, get }) => ({
      transactions: list("transactions"),
      recurring: list("recurring"),
      budgets: get("budgets", "settings"),
      preferences: get("preferences", "settings"),
    }), true) : unwrap(await supabase.rpc("read_account_backup"));
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
    return vault ? { format: "ducat-encrypted-backup", version: 1, ciphertext: await vault.seal(payload, "backup") } : payload;
  },

  restore: async (user, raw, { restoreSettings = false } = {}) => {
    assertVerified(user);
    const backup = parseAccountBackup(raw, user.uid);
    const vault = currentVault(user.uid);
    if (vault) return vault.change(({ get }) => {
      const transactions = backup.transactions.filter(({ id }) => !get("transactions", id));
      const recurring = backup.recurring.filter(({ id }) => !get("recurring", id));
      const timestamp = new Date().toISOString();
      const changes = [
        ...transactions.map((item) => transactionRecord(item.id, user.uid, toTransactionRow(item))),
        ...recurring.map((item) => vaultRecord("recurring", item.id, {
          ...toRecurringRow(item), id: item.id, user_id: user.uid, created_at: timestamp, updated_at: timestamp,
        })),
      ];
      if (restoreSettings) changes.push(vaultRecord("budgets", "settings", backup.budgets), vaultRecord("preferences", "settings", backup.preferences));
      return { changes, result: { transactions: transactions.length, recurring: recurring.length } };
    });
    const result = unwrap(await supabase.rpc("restore_account_backup", {
      p_backup: backup, p_restore_settings: restoreSettings,
    }));
    TransactionService.invalidateCache();
    for (const topic of ["transactions", "recurring", "budgets", "preferences"]) emitLocalChange(topic);
    return result;
  },
};
