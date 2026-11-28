import { describe, expect, it } from "vitest";
import { computeMonthProjection, projectBudgetRow } from "../src/utils/projection.js";

describe("computeMonthProjection", () => {
  const startDate = new Date(2026, 10, 1); // 2026-11-01
  const endDate = new Date(2026, 10, 30, 23, 59, 59); // 2026-11-30
  const today = new Date(2026, 10, 10); // Day 10 of 30 (20 remaining)

  it("projects end-of-month balance combining variable daily pace and remaining recurring rules", () => {
    const recurring = [
      // Already paid on day 1 (should not distort daily variable pace)
      { id: "r-rent", type: "expense", amountMinor: 80000, category: "casa", frequency: "monthly", anchorDateKey: "2026-10-01", nextIndex: 2, paused: false },
      // Still upcoming on Nov 20
      { id: "r-net", type: "expense", amountMinor: 2000, category: "abbonamenti", frequency: "monthly", anchorDateKey: "2026-10-20", nextIndex: 1, paused: false },
      // Upcoming salary on Nov 27
      { id: "r-sal", type: "income", amountMinor: 200000, category: "stipendio", frequency: "monthly", anchorDateKey: "2026-10-27", nextIndex: 1, paused: false },
    ];
    const monthTransactions = [
      { id: "tx-rent", type: "expense", amountMinor: 80000, category: "casa", date: new Date(2026, 10, 1) },
      { id: "tx-food", type: "expense", amountMinor: 10000, category: "supermercato", date: new Date(2026, 10, 5) },
    ];
    const stats = { totalIncome: 0, totalExpense: 900, balance: -900 };

    const result = computeMonthProjection({ stats, monthTransactions, recurring, startDate, endDate, today });
    expect(result).not.toBeNull();
    // Variable expense: 100 EUR over 10 days = 10 EUR/day -> 200 EUR remaining variable
    // Remaining recurring: +2000 income, -20 expense
    // Projected expense: 900 + 20 + 200 = 1120; projected income: 2000; balance: +880
    expect(result.dailyVariableExpense).toBe(10);
    expect(result.remainingVariableExpense).toBe(200);
    expect(stats.balance + result.remainingRecurringIncome - result.remainingRecurringExpense - result.remainingVariableExpense).toBe(result.projectedBalance);
    expect(result.remainingRecurringIncome).toBe(2000);
    expect(result.remainingRecurringExpense).toBe(20);
    expect(result.projectedExpense).toBe(1120);
    expect(result.projectedBalance).toBe(880);
  });

  it("returns null on the first day of the cycle or after the cycle ends", () => {
    const stats = { totalIncome: 1000, totalExpense: 100, balance: 900 };
    expect(computeMonthProjection({ stats, startDate, endDate, today: new Date(2026, 10, 1) })).toBeNull();
    expect(computeMonthProjection({ stats, startDate, endDate, today: new Date(2026, 10, 30) })).toBeNull();
    expect(computeMonthProjection({ stats, startDate, endDate, today: new Date(2026, 11, 5) })).toBeNull();
  });

  it("adds future transactions once and excludes them from the spending pace", () => {
    const recurring = [{ id: "rent", type: "expense", amountMinor: 80000, category: "casa", frequency: "monthly", anchorDateKey: "2026-11-20", nextIndex: 0, paused: false }];
    const monthTransactions = [
      { type: "expense", amountMinor: 10000, category: "spesa", date: new Date(2026, 10, 5) },
      { id: "owner_rec-rent-2026-11-20", type: "expense", amountMinor: 80000, category: "casa", date: new Date(2026, 10, 20) },
      { type: "income", amountMinor: 50000, category: "stipendio", date: new Date(2026, 10, 25) },
    ];
    const result = computeMonthProjection({ stats: { totalIncome: 0, totalExpense: 100 }, monthTransactions, recurring, startDate, endDate, today });
    expect(result.dailyVariableExpense).toBe(10);
    expect(result.scheduledExpense).toBe(800);
    expect(result.scheduledIncome).toBe(500);
    expect(result.remainingRecurringExpense).toBe(0);
    expect(result.projectedBalance).toBe(-600);
  });
});

describe("projectBudgetRow", () => {
  const startDate = new Date(2026, 10, 1);
  const endDate = new Date(2026, 10, 30);

  it("warns when current pace will exceed the budget before month end", () => {
    // 200 EUR spent in 10 days -> 20 EUR/day -> 600 EUR projected vs 300 EUR limit -> over in 5 days
    const pace = projectBudgetRow(
      { category: "supermercato", spentMinor: 20000, limitMinor: 30000, status: "ok" },
      { startDate, endDate, today: new Date(2026, 10, 10) }
    );
    expect(pace).toEqual({
      projectedMinor: 60000,
      overByMinor: 30000,
      daysUntilOver: 5,
    });
  });

  it("returns null when already over budget or comfortably on track", () => {
    expect(projectBudgetRow(
      { category: "supermercato", spentMinor: 35000, limitMinor: 30000, status: "over" },
      { startDate, endDate, today: new Date(2026, 10, 10) }
    )).toBeNull();
    expect(projectBudgetRow(
      { category: "supermercato", spentMinor: 5000, limitMinor: 30000, status: "ok" },
      { startDate, endDate, today: new Date(2026, 10, 10) }
    )).toBeNull();
  });
});
