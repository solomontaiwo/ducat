import { describe, expect, it } from "vitest";
import { it as itLocale } from "date-fns/locale";
import { buildAnnualSummary } from "../src/utils/analyticsModel.js";

describe("buildAnnualSummary", () => {
  it("computes best saving month, highest expense month and top category for a given year", () => {
    const txs = [
      { id: "1", type: "income", amountMinor: 200000, category: "stipendio", date: new Date(2026, 0, 27) },
      { id: "2", type: "expense", amountMinor: 50000, category: "casa", date: new Date(2026, 0, 5) },
      { id: "3", type: "income", amountMinor: 200000, category: "stipendio", date: new Date(2026, 4, 27) },
      { id: "4", type: "expense", amountMinor: 120000, category: "viaggi", date: new Date(2026, 4, 15) },
      // Different year ignored
      { id: "5", type: "expense", amountMinor: 999900, category: "altro", date: new Date(2025, 11, 1) },
    ];

    const recap = buildAnnualSummary(txs, 2026, {
      expenseCategories: [
        { value: "casa", label: "Casa e bollette" },
        { value: "viaggi", label: "Viaggi" },
      ],
      locale: itLocale,
    });

    expect(recap).toMatchObject({
      year: 2026,
      transactionCount: 4,
      activeMonths: 2,
      income: 4000,
      expense: 1700,
      net: 2300,
      savingsRate: 58,
      bestSavingMonth: { label: "gennaio", net: 1500 },
      highestExpenseMonth: { label: "maggio", expense: 1200 },
      topCategory: { category: "viaggi", label: "Viaggi", amount: 1200 },
    });
  });

  it("returns null when the year has no transactions", () => {
    expect(buildAnnualSummary([], 2026)).toBeNull();
  });
});
