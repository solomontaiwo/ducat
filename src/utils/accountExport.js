import { getTransactionAmountMinor, minorToMajor } from "./money.js";
import { coerceDateKey } from "./dateUtils.js";

export const buildAccountExport = ({ user, profileName, transactions, exportedAt = new Date() }) => ({
  schemaVersion: 1,
  exportedAt: exportedAt.toISOString(),
  account: {
    uid: user.uid,
    email: user.email || null,
    displayName: profileName || user.displayName || null,
    emailVerified: Boolean(user.emailVerified),
    createdAt: user.metadata?.creationTime || null,
  },
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
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};
