import { format, isToday, isYesterday } from "date-fns";
import { enUS, it } from "date-fns/locale";
import { compareTransactions } from "./transactionOrder.js";

const localeFor = (language) => (language === "it" ? it : enUS);

/** "Today", "Yesterday" or a long date in the active language. */
export const formatGroupDate = (date, language, t) => {
  const lang = language || "it";
  if (isToday(date)) return t("transactions.today");
  if (isYesterday(date)) return t("transactions.yesterday");
  // 'd MMMM yyyy' is standard for Italian, 'MMMM d, yyyy' for English.
  return format(date, lang === "it" ? "d MMMM yyyy" : "MMMM d, yyyy", { locale: localeFor(lang) });
};

/** Groups by calendar day, newest day first, with a stable order inside each day. */
export const groupTransactionsByDate = (transactions, formatDate) => {
  const groups = {};
  transactions.forEach((transaction) => {
    const date = transaction.date;
    const dayKey = format(date, "yyyy-MM-dd");
    if (!groups[dayKey]) groups[dayKey] = { date, displayDate: formatDate(date), transactions: [] };
    groups[dayKey].transactions.push(transaction);
  });
  return Object.values(groups)
    .map((group) => ({ ...group, transactions: group.transactions.sort(compareTransactions) }))
    .sort((first, second) => second.date - first.date);
};
