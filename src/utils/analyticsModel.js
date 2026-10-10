import { addMilliseconds, differenceInCalendarDays, endOfDay, endOfMonth, format, isSameDay, isWithinInterval, startOfDay, subDays, subMonths } from "date-fns";
import { getTransactionAmountMinor, minorToMajor } from "./money";
import { readLocalValue, removeLocalValue } from "./storage.js";
import { cycleMonthFor, cycleRange } from "./monthCycle.js";

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
export const getAnalyticsQueryRange = (startDate, endDate, now = new Date(), compareStart = null, startDay = 1) => {
  const trendStart = cycleRange(subMonths(cycleMonthFor(now, startDay), TREND_MONTHS - 1), startDay).startDate;
  let start = startDate < trendStart ? startDate : trendStart;
  if (compareStart && compareStart < start) start = compareStart;
  return {
    startDate: start,
    endDate: endDate > now ? endDate : endOfMonth(now),
  };
};

const PERIOD_MONTH_SHIFT = { month: 1, lastMonth: 1, last3Months: 3, year: 12 };

/** The end of the period that has actually happened: never later than today. */
export const getEffectiveEnd = (endDate, now = new Date()) => (endDate > now ? endOfDay(now) : endDate);

/**
 * The period to compare against, with the same number of elapsed days: on
 * 9 October "this month" is compared with 1–9 September, not all of it.
 */
export const getComparisonRange = (period, startDate, endDate, now = new Date()) => {
  const effectiveEnd = getEffectiveEnd(endDate, now);
  const months = PERIOD_MONTH_SHIFT[period];
  if (months) {
    return {
      kind: period === "year" ? "year" : period === "last3Months" ? "previousPeriod" : "month",
      startDate: startOfDay(subMonths(startDate, months)),
      endDate: endOfDay(subMonths(effectiveEnd, months)),
    };
  }
  const days = differenceInCalendarDays(effectiveEnd, startDate) + 1;
  return {
    kind: "previousPeriod",
    startDate: startOfDay(subDays(startDate, days)),
    endDate: addMilliseconds(startOfDay(startDate), -1),
  };
};

const monthShort = (date, locale) => format(date, "LLL", { locale }).replace(".", "");

/**
 * Names the comparison range so it can't be misread: whole months by name
 * ("agosto", "apr–giu", "2025"), anything else by its dates ("1–10 set").
 * The year appears only when it differs from the current one; `long` always
 * has it, for the explanation shown on tap.
 */
export const describeComparisonRange = ({ startDate, endDate }, { startDay = 1, locale, now = new Date() } = {}) => {
  const firstCycle = cycleRange(cycleMonthFor(startDate, startDay), startDay);
  const lastCycle = cycleRange(cycleMonthFor(endDate, startDay), startDay);
  const wholeCycles = isSameDay(startDate, firstCycle.startDate) && isSameDay(endDate, lastCycle.endDate);
  const sameYear = startDate.getFullYear() === endDate.getFullYear();
  const showYear = endDate.getFullYear() !== now.getFullYear() || !sameYear;
  const year = (date) => format(date, "yyyy", { locale });

  if (wholeCycles) {
    const first = cycleMonthFor(startDate, startDay);
    const last = cycleMonthFor(endDate, startDay);
    const months = (last.getFullYear() - first.getFullYear()) * 12 + last.getMonth() - first.getMonth() + 1;
    if (months === 12 && first.getMonth() === 0) {
      return { short: year(first), long: year(first), wholePeriod: true };
    }
    if (months === 1) {
      return {
        short: format(first, "LLLL", { locale }) + (showYear ? ` ${year(first)}` : ""),
        long: format(first, "LLLL yyyy", { locale }),
        wholePeriod: true,
      };
    }
    const sameYearMonths = first.getFullYear() === last.getFullYear();
    return {
      short: sameYearMonths
        ? `${monthShort(first, locale)}–${monthShort(last, locale)}${showYear ? ` ${year(last)}` : ""}`
        : `${monthShort(first, locale)} ${year(first)}–${monthShort(last, locale)} ${year(last)}`,
      long: sameYearMonths
        ? `${format(first, "LLLL", { locale })} – ${format(last, "LLLL yyyy", { locale })}`
        : `${format(first, "LLLL yyyy", { locale })} – ${format(last, "LLLL yyyy", { locale })}`,
      wholePeriod: true,
    };
  }

  const sameMonth = sameYear && startDate.getMonth() === endDate.getMonth();
  let short;
  let long;
  if (isSameDay(startDate, endDate)) {
    short = `${format(startDate, "d", { locale })} ${monthShort(startDate, locale)}${showYear ? ` ${year(startDate)}` : ""}`;
    long = format(startDate, "d LLLL yyyy", { locale });
  } else if (sameMonth) {
    short = `${format(startDate, "d", { locale })}–${format(endDate, "d", { locale })} ${monthShort(endDate, locale)}${showYear ? ` ${year(endDate)}` : ""}`;
    long = `${format(startDate, "d", { locale })}–${format(endDate, "d LLLL yyyy", { locale })}`;
  } else if (sameYear) {
    short = `${format(startDate, "d", { locale })} ${monthShort(startDate, locale)}–${format(endDate, "d", { locale })} ${monthShort(endDate, locale)}${showYear ? ` ${year(endDate)}` : ""}`;
    long = `${format(startDate, "d LLLL", { locale })} – ${format(endDate, "d LLLL yyyy", { locale })}`;
  } else {
    short = `${format(startDate, "d", { locale })} ${monthShort(startDate, locale)} ${year(startDate)}–${format(endDate, "d", { locale })} ${monthShort(endDate, locale)} ${year(endDate)}`;
    long = `${format(startDate, "d LLLL yyyy", { locale })} – ${format(endDate, "d LLLL yyyy", { locale })}`;
  }
  return { short, long, wholePeriod: false };
};

/**
 * Relative change between two values. `null` when there is nothing sensible to
 * compare against (previous value of zero).
 */
export const compareValues = (current, previous) => {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(pct) < 1) return { direction: "flat", pct: 0, diff: current - previous };
  return { direction: pct > 0 ? "up" : "down", pct: Math.round(Math.abs(pct)), diff: current - previous };
};

/** Per-category change in euro between two ranges, biggest movers first. */
export const categoryDeltas = (transactions, type, current, previous) => {
  const totals = (range) => {
    const map = {};
    transactions.forEach((item) => {
      if (item.type !== type || !item.date || !isWithinInterval(item.date, { start: range.startDate, end: range.endDate })) return;
      map[item.category] = (map[item.category] || 0) + getTransactionAmountMinor(item);
    });
    return map;
  };
  const now = totals(current);
  const before = totals(previous);
  const result = {};
  new Set([...Object.keys(now), ...Object.keys(before)]).forEach((category) => {
    result[category] = minorToMajor((now[category] || 0) - (before[category] || 0));
  });
  return result;
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

export const buildMonthlyTrend = (transactions, now = new Date(), startDay = 1) => {
  const trend = [];
  const current = cycleMonthFor(now, startDay);
  for (let offset = TREND_MONTHS - 1; offset >= 0; offset -= 1) {
    const monthStart = subMonths(current, offset);
    const { startDate, endDate } = cycleRange(monthStart, startDay);
    const inMonth = transactions.filter((item) => item.date && isWithinInterval(item.date, { start: startDate, end: endDate }));
    const income = minorToMajor(sumMinor(inMonth.filter((item) => item.type === "income")));
    const expense = minorToMajor(sumMinor(inMonth.filter((item) => item.type === "expense")));
    trend.push({ month: format(monthStart, "MMM yyyy"), monthStart, income, expense, balance: income - expense });
  }
  return trend;
};

/** Everything the analytics view shows beyond the basic period totals. */
export const buildExtendedStats = ({
  analyticsData, startDate, endDate, stats, expenseCategories, incomeCategories, t, now = new Date(), startDay = 1,
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
    monthlyTrend: buildMonthlyTrend(analyticsData, now, startDay),
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
