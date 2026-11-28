import { differenceInCalendarDays, endOfDay, startOfDay } from "date-fns";
import { coerceDateKey, todayDateKey } from "./dateUtils.js";
import { getTransactionAmountMinor, minorToMajor } from "./money.js";
import { nextOccurrence, occurrenceDateKey, occurrenceRequestId } from "./recurrence.js";

const MAX_OCCURRENCES_PER_RULE = 12;

const sumRemainingRecurringMinor = (recurring, afterKey, upToKey, scheduled) => {
  let incomeMinor = 0;
  let expenseMinor = 0;
  for (const rule of recurring || []) {
    if (!rule || rule.paused || !rule.anchorDateKey) continue;
    let index = nextOccurrence(rule).index;
    for (let step = 0; step < MAX_OCCURRENCES_PER_RULE; step += 1) {
      const dateKey = occurrenceDateKey(rule.anchorDateKey, rule.frequency, index + step);
      if (dateKey > upToKey) break;
      if (dateKey > afterKey) {
        const requestId = occurrenceRequestId(rule.id, dateKey).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
        const matched = scheduled.findIndex((item) => item.clientRequestId === requestId || item.id?.endsWith(`_${requestId}`));
        if (matched !== -1) { scheduled.splice(matched, 1); continue; }
        if (rule.type === "income") incomeMinor += rule.amountMinor;
        else if (rule.type === "expense") expenseMinor += rule.amountMinor;
      }
    }
  }
  return { incomeMinor, expenseMinor };
};

const isLikelyRecurringExpense = (transaction, recurring) => {
  if (!transaction || transaction.type !== "expense") return false;
  if (typeof transaction.id === "string" && transaction.id.includes("rec-")) return true;
  if (typeof transaction.clientRequestId === "string" && transaction.clientRequestId.startsWith("rec-")) return true;
  const minor = getTransactionAmountMinor(transaction);
  return (recurring || []).some((rule) => (
    !rule.paused
    && rule.type === "expense"
    && rule.category === transaction.category
    && rule.amountMinor === minor
  ));
};

/**
 * Projects end-of-cycle balance and expenses using:
 * - current cycle income/expenses so far;
 * - remaining active recurring rules scheduled before `endDate`;
 * - daily variable (non-recurring) spending pace over elapsed days.
 *
 * Returns `null` when the cycle is finished or too early (< 2 elapsed days).
 */
export const computeMonthProjection = ({
  stats,
  monthTransactions = [],
  recurring = [],
  startDate,
  endDate,
  today = new Date(),
}) => {
  if (!stats || !startDate || !endDate) return null;
  const start = startOfDay(startDate);
  const end = endOfDay(endDate);
  const now = startOfDay(today);
  if (now < start || now >= startOfDay(end)) return null;

  const totalDays = differenceInCalendarDays(startOfDay(end), start) + 1;
  const elapsedDays = differenceInCalendarDays(now, start) + 1;
  const remainingDays = totalDays - elapsedDays;
  if (elapsedDays < 2 || remainingDays <= 0) return null;
  const todayKey = coerceDateKey(now) || todayDateKey();
  const endKey = coerceDateKey(end);
  const future = monthTransactions.filter((item) => {
    const dateKey = item.dateKey || coerceDateKey(item.date);
    return dateKey > todayKey && dateKey <= endKey;
  });
  if (stats.totalIncome === 0 && stats.totalExpense === 0 && !recurring.length && !future.length) return null;
  const scheduled = future.map((item) => ({ ...item, dateKey: item.dateKey || coerceDateKey(item.date) }));
  const remainingRecurring = sumRemainingRecurringMinor(recurring, todayKey, endKey, [...scheduled]);
  const scheduledIncomeMinor = scheduled.filter((item) => item.type === "income").reduce((sum, item) => sum + getTransactionAmountMinor(item), 0);
  const scheduledExpenseMinor = scheduled.filter((item) => item.type === "expense").reduce((sum, item) => sum + getTransactionAmountMinor(item), 0);

  // Exclude recurring bills already posted this month from the variable daily pace
  // so an 800€ rent on day 1 does not extrapolate into 12.000€ of daily spending.
  const expenses = monthTransactions.filter((item) => item.type === "expense" && (item.dateKey || coerceDateKey(item.date)) <= todayKey);
  const variableSpentMinor = expenses.length
    ? expenses
      .filter((item) => !isLikelyRecurringExpense(item, recurring))
      .reduce((sum, item) => sum + getTransactionAmountMinor(item), 0)
    : Math.round(stats.totalExpense * 100);

  const dailyVariableMinor = variableSpentMinor / elapsedDays;
  const projectedVariableRemainingMinor = Math.round(dailyVariableMinor * remainingDays);

  const currentIncomeMinor = Math.round(stats.totalIncome * 100);
  const currentExpenseMinor = Math.round(stats.totalExpense * 100);
  const projectedIncomeMinor = currentIncomeMinor + remainingRecurring.incomeMinor + scheduledIncomeMinor;
  const projectedExpenseMinor = currentExpenseMinor + remainingRecurring.expenseMinor + scheduledExpenseMinor + projectedVariableRemainingMinor;
  const projectedBalanceMinor = projectedIncomeMinor - projectedExpenseMinor;

  return {
    elapsedDays,
    remainingDays,
    totalDays,
    projectedIncome: minorToMajor(projectedIncomeMinor),
    projectedExpense: minorToMajor(projectedExpenseMinor),
    projectedBalance: minorToMajor(projectedBalanceMinor),
    remainingRecurringExpense: minorToMajor(remainingRecurring.expenseMinor),
    remainingRecurringIncome: minorToMajor(remainingRecurring.incomeMinor),
    scheduledIncome: minorToMajor(scheduledIncomeMinor),
    scheduledExpense: minorToMajor(scheduledExpenseMinor),
    remainingVariableExpense: minorToMajor(projectedVariableRemainingMinor),
    dailyVariableExpense: minorToMajor(Math.round(dailyVariableMinor)),
  };
};

/**
 * Predicts whether a budget category that is still within limit is on pace to
 * exceed its monthly cap before the end of the cycle.
 */
export const projectBudgetRow = (row, { startDate, endDate, today = new Date() }) => {
  if (!row || row.status === "over" || !row.limitMinor || !row.spentMinor || !startDate || !endDate) return null;
  const start = startOfDay(startDate);
  const end = startOfDay(endDate);
  const now = startOfDay(today);
  if (now < start || now >= end) return null;

  const totalDays = differenceInCalendarDays(end, start) + 1;
  const elapsedDays = differenceInCalendarDays(now, start) + 1;
  const remainingDays = totalDays - elapsedDays;
  if (elapsedDays < 3 || remainingDays <= 0) return null;

  const dailyMinor = row.spentMinor / elapsedDays;
  const projectedMinor = Math.round(dailyMinor * totalDays);
  if (projectedMinor <= row.limitMinor) return null;

  const daysUntilOver = Math.max(1, Math.min(remainingDays, Math.ceil((row.limitMinor - row.spentMinor) / dailyMinor)));
  return {
    projectedMinor,
    overByMinor: projectedMinor - row.limitMinor,
    daysUntilOver,
  };
};
