import { describe, expect, it } from "vitest";
import {
  CATEGORY_CHART_COLORS,
  buildExtendedStats,
  buildMonthlyTrend,
  categoryDeltas,
  compareValues,
  describeComparisonRange,
  getAnalyticsQueryRange,
  getComparisonRange,
  readPeriodPreference,
  withChartColors,
} from "../src/utils/analyticsModel.js";
import { calculateStats } from "../src/utils/statsUtils.jsx";
import { enUS, it as itLocale } from "date-fns/locale";

const tx = (id, type, category, amountMinor, date) => ({
  id, type, category, amountMinor, amount: amountMinor / 100, description: id, date: new Date(date),
});
const t = (key, options) => options?.defaultValue ?? key;
const categories = [{ value: "cibo", label: "🍕 Cibo" }, { value: "stipendio", label: "💼 Stipendio" }];

const NOW = new Date(2026, 8, 15, 12);
const data = [
  tx("a", "expense", "cibo", 1050, new Date(2026, 8, 3)),
  tx("b", "expense", "cibo", 2000, new Date(2026, 8, 10)),
  tx("c", "expense", "trasporti", 500, new Date(2026, 8, 11)),
  tx("d", "income", "stipendio", 100000, new Date(2026, 8, 1)),
  tx("old", "expense", "cibo", 9999, new Date(2026, 3, 2)),
];
const startDate = new Date(2026, 8, 1);
const endDate = new Date(2026, 8, 30, 23, 59, 59);

describe("buildExtendedStats", () => {
  const stats = calculateStats(data, startDate, endDate);
  const extended = buildExtendedStats({
    analyticsData: data, startDate, endDate, stats, expenseCategories: categories, incomeCategories: categories, t, now: NOW,
  });

  it("returns an empty object without data", () => {
    expect(buildExtendedStats({ analyticsData: [], startDate, endDate, stats, expenseCategories: [], incomeCategories: [], t })).toEqual({});
  });

  it("ranks categories by exact total within the selected period only", () => {
    expect(extended.topExpenseCategories.map((item) => [item.category, item.amount])).toEqual([["cibo", 30.5], ["trasporti", 5]]);
    expect(extended.topExpenseCategories[0].label).toBe("Cibo");
    expect(extended.topExpenseCategories[0].percentage).toBeCloseTo((30.5 / 35.5) * 100, 5);
    expect(extended.filteredTransactions.map((item) => item.id).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("picks the largest individual movements and computes the savings rate", () => {
    expect(extended.topExpenseTransactions.map((item) => item.id)).toEqual(["b", "a", "c"]);
    expect(extended.topIncomeTransactions.map((item) => item.id)).toEqual(["d"]);
    expect(extended.savingsRate).toBeCloseTo(((1000 - 35.5) / 1000) * 100, 5);
    expect(extended.avgTransactionAmount).toBeCloseTo((1000 + 35.5) / 4, 2);
  });

  it("falls back to the translation key for unknown categories", () => {
    expect(extended.topExpenseCategories[1].label).toBe("trasporti");
  });
});

describe("buildMonthlyTrend", () => {
  it("covers six months ending with the current one, including older data", () => {
    const trend = buildMonthlyTrend(data, NOW);
    expect(trend).toHaveLength(6);
    expect(trend.at(-1)).toMatchObject({ income: 1000, expense: 35.5, balance: 964.5 });
    expect(trend[0].month).toBe("Apr 2026");
    expect(trend[0].expense).toBe(99.99);
    expect(trend[1].expense).toBe(0);
  });
});

describe("getAnalyticsQueryRange", () => {
  it("widens a short period to cover the six-month trend", () => {
    const range = getAnalyticsQueryRange(startDate, endDate, NOW);
    expect(range.startDate).toEqual(new Date(2026, 3, 1));
    expect(range.endDate.getTime()).toBeGreaterThanOrEqual(endDate.getTime());
  });

  it("keeps a longer custom period untouched", () => {
    const longStart = new Date(2025, 0, 1);
    expect(getAnalyticsQueryRange(longStart, endDate, NOW).startDate).toEqual(longStart);
  });
});

describe("readPeriodPreference", () => {
  it("falls back to the month view on corrupt or unknown values", () => {
    localStorage.setItem("analytics-period", "{broken");
    expect(readPeriodPreference()).toEqual({ period: "month", customRange: null });
    expect(localStorage.getItem("analytics-period")).toBeNull();
    localStorage.setItem("analytics-period", JSON.stringify({ period: "decade" }));
    expect(readPeriodPreference().period).toBe("month");
  });

  it("restores a valid saved period", () => {
    localStorage.setItem("analytics-period", JSON.stringify({ period: "year", customRange: { from: "2026-01-01", to: "2026-02-01" } }));
    expect(readPeriodPreference()).toEqual({ period: "year", customRange: { from: "2026-01-01", to: "2026-02-01" } });
    localStorage.clear();
  });
});

describe("withChartColors", () => {
  it("cycles through the palette", () => {
    const items = Array.from({ length: CATEGORY_CHART_COLORS.length + 1 }, (_, index) => ({ category: String(index) }));
    const coloured = withChartColors(items, CATEGORY_CHART_COLORS);
    expect(coloured.at(-1).fill).toBe(CATEGORY_CHART_COLORS[0]);
    expect(withChartColors(undefined, CATEGORY_CHART_COLORS)).toEqual([]);
  });
});

describe("comparison with the previous period", () => {
  const OCT_9 = new Date(2026, 9, 9, 15, 0);

  it("compares the running month with the same days of the previous one", () => {
    const range = getComparisonRange("month", new Date(2026, 9, 1), new Date(2026, 9, 31, 23, 59, 59), OCT_9);
    expect(range.kind).toBe("month");
    expect(range.startDate).toEqual(new Date(2026, 8, 1));
    expect(range.endDate.getDate()).toBe(9);
    expect(range.endDate.getMonth()).toBe(8);
  });

  it("clamps to the end of a shorter month", () => {
    const range = getComparisonRange("month", new Date(2026, 2, 1), new Date(2026, 2, 31, 23, 59, 59), new Date(2026, 2, 31, 12));
    expect(range.endDate.getMonth()).toBe(1);
    expect(range.endDate.getDate()).toBe(28);
  });

  it("uses the previous year for the year period", () => {
    const range = getComparisonRange("year", new Date(2026, 0, 1), new Date(2026, 11, 31, 23, 59), OCT_9);
    expect(range.kind).toBe("year");
    expect(range.startDate).toEqual(new Date(2025, 0, 1));
    expect(range.endDate.getFullYear()).toBe(2025);
    expect(range.endDate.getMonth()).toBe(9);
  });

  it("uses an equally long window right before a custom range", () => {
    const range = getComparisonRange("custom", new Date(2026, 8, 11), new Date(2026, 8, 20, 23, 59, 59, 999), OCT_9);
    expect(range.startDate).toEqual(new Date(2026, 8, 1));
    expect(range.endDate).toEqual(new Date(2026, 8, 10, 23, 59, 59, 999));
  });

  it("describes the change between two values", () => {
    expect(compareValues(112, 100)).toMatchObject({ direction: "up", pct: 12 });
    expect(compareValues(80, 100)).toMatchObject({ direction: "down", pct: 20 });
    expect(compareValues(100.4, 100)).toMatchObject({ direction: "flat" });
    expect(compareValues(10, 0)).toBeNull();
  });

  it("computes per-category deltas", () => {
    const tx = (day, month, category, amount) => ({ type: "expense", category, amount, amountMinor: amount * 100, date: new Date(2026, month, day) });
    const data = [tx(2, 9, "supermercato", 50), tx(3, 8, "supermercato", 20), tx(4, 8, "shopping", 30), tx(20, 8, "shopping", 999)];
    const current = { startDate: new Date(2026, 9, 1), endDate: new Date(2026, 9, 9, 23, 59) };
    const previous = { startDate: new Date(2026, 8, 1), endDate: new Date(2026, 8, 9, 23, 59) };
    expect(categoryDeltas(data, "expense", current, previous)).toEqual({ supermercato: 30, shopping: -30 });
  });

  it("widens the query to cover the comparison range", () => {
    const compareStart = new Date(2025, 0, 1);
    expect(getAnalyticsQueryRange(new Date(2026, 0, 1), new Date(2026, 11, 31), OCT_9, compareStart).startDate).toEqual(compareStart);
  });
});

describe("describeComparisonRange", () => {
  const NOW = new Date(2026, 9, 10, 12);
  const range = (start, end) => ({ startDate: start, endDate: new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999) });
  const describe_ = (start, end, options = {}) => describeComparisonRange(range(start, end), { locale: itLocale, now: NOW, ...options });

  it("names the elapsed days when this month is compared with the same days of the previous one", () => {
    expect(describe_(new Date(2026, 8, 1), new Date(2026, 8, 10))).toEqual({
      short: "1–10 set", long: "1–10 settembre 2026", wholePeriod: false,
    });
  });

  it("names whole months, and groups of months, by name", () => {
    expect(describe_(new Date(2026, 7, 1), new Date(2026, 7, 31))).toEqual({ short: "agosto", long: "agosto 2026", wholePeriod: true });
    expect(describe_(new Date(2026, 3, 1), new Date(2026, 5, 30)).short).toBe("apr–giu");
    expect(describe_(new Date(2026, 6, 1), new Date(2026, 8, 10)).short).toBe("1 lug–10 set");
  });

  it("adds the year only when it is not the current one", () => {
    expect(describe_(new Date(2025, 0, 1), new Date(2025, 9, 10))).toEqual({
      short: "1 gen–10 ott 2025", long: "1 gennaio – 10 ottobre 2025", wholePeriod: false,
    });
    expect(describe_(new Date(2025, 0, 1), new Date(2025, 11, 31)).short).toBe("2025");
    expect(describe_(new Date(2025, 8, 1), new Date(2025, 8, 30)).short).toBe("settembre 2025");
    expect(describe_(new Date(2025, 11, 20), new Date(2026, 0, 5)).short).toBe("20 dic 2025–5 gen 2026");
  });

  it("follows a payday month start", () => {
    expect(describe_(new Date(2026, 6, 27), new Date(2026, 7, 26), { startDay: 27 }).short).toBe("agosto");
    expect(describe_(new Date(2026, 7, 27), new Date(2026, 8, 10), { startDay: 27 }).short).toBe("27 ago–10 set");
  });

  it("speaks English too", () => {
    expect(describeComparisonRange(range(new Date(2026, 8, 1), new Date(2026, 8, 10)), { locale: enUS, now: NOW }).short).toBe("1–10 Sep");
  });
});
