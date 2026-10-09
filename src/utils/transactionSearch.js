import { format, startOfMonth } from "date-fns";
import { enUS, it } from "date-fns/locale";
import { compareTransactions } from "./transactionOrder.js";

const fold = (text = "") => String(text)
  .toLowerCase()
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "");

/** Minimum length before a search runs across the whole history. */
export const MIN_SEARCH_LENGTH = 2;

/**
 * Matches a search term against description, category (key and translated
 * label) and amount. Accent- and case-insensitive; "21" or "21,5" match the
 * amount 21,50.
 */
export const matchesSearch = (transaction, term, getCategoryLabel) => {
  const needle = fold(term).trim();
  if (!needle) return true;
  if (fold(transaction.description).includes(needle)) return true;
  if (fold(transaction.category).includes(needle)) return true;
  if (getCategoryLabel && fold(getCategoryLabel(transaction.category)).includes(needle)) return true;
  if (/^\d+([.,]\d{0,2})?$/.test(needle) && Number.isFinite(transaction.amount)) {
    const amount = transaction.amount.toFixed(2);
    if (amount.startsWith(needle.replace(",", "."))) return true;
  }
  return false;
};

/** Combines a full-history snapshot with the realtime stream (newer copies win). */
export const mergeTransactions = (base = [], fresh = [], removedIds = new Set()) => {
  const merged = new Map(base.map((item) => [item.id, item]));
  fresh.forEach((item) => merged.set(item.id, item));
  removedIds.forEach((id) => merged.delete(id));
  return Array.from(merged.values());
};

/** Groups by calendar month, newest first, with the net amount of each month. */
export const groupTransactionsByMonth = (transactions, language = "it") => {
  const locale = language === "en" ? enUS : it;
  const groups = new Map();
  transactions.forEach((transaction) => {
    const monthStart = startOfMonth(transaction.date);
    const key = monthStart.getTime();
    if (!groups.has(key)) {
      const label = format(monthStart, "LLLL yyyy", { locale });
      groups.set(key, { date: monthStart, displayDate: label.charAt(0).toUpperCase() + label.slice(1), transactions: [] });
    }
    groups.get(key).transactions.push(transaction);
  });
  return Array.from(groups.values())
    .map((group) => ({ ...group, transactions: group.transactions.sort(compareTransactions) }))
    .sort((first, second) => second.date - first.date);
};
