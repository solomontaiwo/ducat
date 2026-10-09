import { describe, expect, it } from "vitest";
import {
  CATEGORY_CHART_COLORS,
  buildExtendedStats,
  buildMonthlyTrend,
  getAnalyticsQueryRange,
  readPeriodPreference,
  withChartColors,
} from "../src/utils/analyticsModel.js";
import { calculateStats } from "../src/utils/statsUtils.jsx";

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
