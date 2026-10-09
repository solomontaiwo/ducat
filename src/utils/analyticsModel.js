import { endOfMonth, format, isWithinInterval, startOfMonth, subMonths } from "date-fns";
import { getTransactionAmountMinor, minorToMajor } from "./money";
import { readLocalValue, removeLocalValue } from "./storage.js";

/** Category palette: theme-aware CSS variables, adjacent entries differ in lightness. */
export const CATEGORY_CHART_COLORS = [1, 2, 3, 4, 5].map((index) => `hsl(var(--cat-${index}))`);

export const PERIOD_PREFERENCE_KEY = "analytics-period";
const ALLOWED_PERIODS = ["month", "lastMonth", "last3Months", "year", "custom"];
const TREND_MONTHS = 6;

/** Reads the saved period, falling back (and clearing the key) on corrupt data. */
export const readPeriodPreference = () => {
  try {
    const parsed = JSON.parse(readLocalValue(PERIOD_PREFERENCE_KEY, "null"));
    return {
      period: ALLOWED_PERIODS.includes(parsed?.period) ? parsed.period : "month",
      customRange: parsed?.customRange && typeof parsed.customRange === "object" ? parsed.customRange : null,
    };
  } catch {
    removeLocalValue(PERIOD_PREFERENCE_KEY);
    return { period: "month", customRange: null };
  }
};

/**
 * The range the analytics view has to load: the selected period, widened so it
 * also covers the monthly trend (last six months up to the end of this month).
 */
export const getAnalyticsQueryRange = (startDate, endDate, now = new Date()) => {
  const trendStart = startOfMonth(subMonths(now, TREND_MONTHS - 1));
  return {
    startDate: startDate < trendStart ? startDate : trendStart,
    endDate: endDate > now ? endDate : endOfMonth(now),
  };
};

const sumMinor = (transactions) => transactions.reduce((sum, item) => sum + getTransactionAmountMinor(item), 0);

const topCategories = (transactions, type, totalAmount, categoryList, t) => {
  const totals = {};
  transactions.filter((item) => item.type === type).forEach((item) => {
    totals[item.category] = (totals[item.category] || 0) + getTransactionAmountMinor(item);
  });
  return Object.entries(totals)
    .sort(([, first], [, second]) => second - first)
    .slice(0, 5)
    .map(([category, amountMinor]) => {
      const amount = minorToMajor(amountMinor);
      const categoryData = categoryList.find((candidate) => candidate.value === category);
      const rawLabel = categoryData?.label || t(`categories.${category}`, { defaultValue: category });
      return {
        category,
        amount,
        percentage: totalAmount > 0 ? (amount / totalAmount) * 100 : 0,
        label: rawLabel.replace(/^[^\p{L}\p{N}]+/u, "").trim(),
      };
    });
};

const topTransactions = (transactions, type) => transactions
  .filter((item) => item.type === type)
  .sort((first, second) => second.amount - first.amount || second.date.getTime() - first.date.getTime())
  .slice(0, 3);

export const buildMonthlyTrend = (transactions, now = new Date()) => {
  const trend = [];
  for (let offset = TREND_MONTHS - 1; offset >= 0; offset -= 1) {
    const monthStart = startOfMonth(subMonths(now, offset));
    const monthEnd = endOfMonth(subMonths(now, offset));
    const inMonth = transactions.filter((item) => item.date && isWithinInterval(item.date, { start: monthStart, end: monthEnd }));
    const income = minorToMajor(sumMinor(inMonth.filter((item) => item.type === "income")));
    const expense = minorToMajor(sumMinor(inMonth.filter((item) => item.type === "expense")));
    trend.push({ month: format(monthStart, "MMM yyyy"), monthStart, income, expense, balance: income - expense });
  }
  return trend;
};

/** Everything the analytics view shows beyond the basic period totals. */
export const buildExtendedStats = ({
  analyticsData, startDate, endDate, stats, expenseCategories, incomeCategories, t, now = new Date(),
}) => {
  if (!analyticsData.length) return {};

  const filteredTransactions = analyticsData.filter((item) => (
    item.date && isWithinInterval(item.date, { start: startDate, end: endDate })
  ));

  return {
    topExpenseCategories: topCategories(filteredTransactions, "expense", stats.totalExpense, expenseCategories, t),
    topIncomeCategories: topCategories(filteredTransactions, "income", stats.totalIncome, incomeCategories, t),
    topExpenseTransactions: topTransactions(filteredTransactions, "expense"),
    topIncomeTransactions: topTransactions(filteredTransactions, "income"),
    monthlyTrend: buildMonthlyTrend(analyticsData, now),
    avgTransactionAmount: filteredTransactions.length > 0
      ? minorToMajor(Math.round(sumMinor(filteredTransactions) / filteredTransactions.length))
      : 0,
    savingsRate: stats.totalIncome > 0 ? ((stats.totalIncome - stats.totalExpense) / stats.totalIncome) * 100 : 0,
    filteredTransactions, // Needed for export
  };
};

export const withChartColors = (categories = [], palette) => categories.map((category, index) => ({
  ...category,
  fill: palette[index % palette.length],
}));
