import { endOfMonth, isWithinInterval, startOfMonth, subMonths } from "date-fns";
import { getTransactionAmountMinor } from "./money.js";

/** Share of the limit at which a budget turns amber. */
export const NEAR_LIMIT_RATIO = 0.8;
export const AVERAGE_MONTHS = 3;

/** The last full months before `now`, used for the suggested limits. */
export const averageRange = (now = new Date(), months = AVERAGE_MONTHS) => ({
  startDate: startOfMonth(subMonths(now, months)),
  endDate: endOfMonth(subMonths(now, 1)),
});

/** Average monthly expense per category over the range, in cents. */
export const averageByCategory = (transactions, range, months = AVERAGE_MONTHS) => {
  const totals = {};
  transactions.forEach((item) => {
    if (item.type !== "expense" || !item.date || !isWithinInterval(item.date, { start: range.startDate, end: range.endDate })) return;
    totals[item.category] = (totals[item.category] || 0) + getTransactionAmountMinor(item);
  });
  return Object.fromEntries(Object.entries(totals).map(([category, minor]) => [category, Math.round(minor / months)]));
};

/** A round suggestion: the average rounded up to the next 10 €. */
export const suggestLimitMinor = (averageMinor) => {
  if (!averageMinor || averageMinor <= 0) return 0;
  return Math.ceil(averageMinor / 1000) * 1000;
};

/**
 * One row per category with a limit: amount spent this month against it.
 * `breakdown` is the month's expense per category in euro.
 */
export const budgetRows = (limits = {}, breakdown = {}, labelFor = (value) => value) => Object.entries(limits)
  .filter(([, limitMinor]) => limitMinor > 0)
  .map(([category, limitMinor]) => {
    const spentMinor = Math.round((breakdown[category] || 0) * 100);
    const ratio = spentMinor / limitMinor;
    return {
      category,
      label: labelFor(category),
      spentMinor,
      limitMinor,
      ratio,
      status: ratio > 1 ? "over" : ratio >= NEAR_LIMIT_RATIO ? "near" : "ok",
    };
  })
  .sort((first, second) => second.ratio - first.ratio);
