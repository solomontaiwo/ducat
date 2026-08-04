import { differenceInDays, endOfDay, isWithinInterval, startOfDay } from "date-fns";
import { getTransactionAmountMinor, minorToMajor } from "./money";

export const buildReportModel = (transactions = [], startDate, endDate) => {
  if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) throw new Error("Invalid report start date");
  if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) throw new Error("Invalid report end date");
  const range = { start: startOfDay(startDate), end: endOfDay(endDate) };
  if (range.start > range.end) throw new Error("Report start date must not be after end date");

  const filteredTransactions = transactions
    .filter((transaction) => transaction.date && isWithinInterval(transaction.date, range))
    .slice()
    .sort((first, second) => second.date - first.date);

  let totalIncomeMinor = 0;
  let totalExpenseMinor = 0;
  const expenseCategories = new Map();

  filteredTransactions.forEach((transaction) => {
    const amountMinor = getTransactionAmountMinor(transaction);
    if (transaction.type === "income") {
      totalIncomeMinor += amountMinor;
      return;
    }
    if (transaction.type === "expense") {
      totalExpenseMinor += amountMinor;
      const current = expenseCategories.get(transaction.category) || { totalMinor: 0, count: 0 };
      expenseCategories.set(transaction.category, {
        totalMinor: current.totalMinor + amountMinor,
        count: current.count + 1,
      });
    }
  });

  const days = differenceInDays(range.end, range.start) + 1;
  const categoryBreakdown = Array.from(expenseCategories.entries())
    .map(([category, value]) => ({
      category,
      amount: minorToMajor(value.totalMinor),
      average: minorToMajor(Math.round(value.totalMinor / value.count)),
      percentage: totalExpenseMinor ? (value.totalMinor / totalExpenseMinor) * 100 : 0,
      count: value.count,
    }))
    .sort((first, second) => second.amount - first.amount);

  const byAmount = (type) => filteredTransactions
    .filter((transaction) => transaction.type === type)
    .slice()
    .sort((first, second) => getTransactionAmountMinor(second) - getTransactionAmountMinor(first))
    .slice(0, 3);

  return {
    startDate: range.start,
    endDate: range.end,
    days,
    transactions: filteredTransactions,
    transactionCount: filteredTransactions.length,
    totalIncome: minorToMajor(totalIncomeMinor),
    totalExpense: minorToMajor(totalExpenseMinor),
    balance: minorToMajor(totalIncomeMinor - totalExpenseMinor),
    avgDailyIncome: minorToMajor(Math.round(totalIncomeMinor / days)),
    avgDailyExpense: minorToMajor(Math.round(totalExpenseMinor / days)),
    categoryBreakdown,
    topExpenses: byAmount("expense"),
    topIncomes: byAmount("income"),
  };
};
