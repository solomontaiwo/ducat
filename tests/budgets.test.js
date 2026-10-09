import { describe, expect, it } from "vitest";
import { averageByCategory, averageRange, budgetRows, suggestLimitMinor } from "../src/utils/budgets.js";

describe("budgets", () => {
  it("averages the last three full months per category", () => {
    const range = averageRange(new Date(2026, 9, 9));
    expect(range.startDate).toEqual(new Date(2026, 6, 1));
    expect(range.endDate.getMonth()).toBe(8);
    const tx = (month, category, minor, type = "expense") => ({ type, category, amountMinor: minor, amount: minor / 100, date: new Date(2026, month, 5) });
    const data = [tx(6, "supermercato", 30000), tx(7, "supermercato", 30000), tx(8, "supermercato", 30100), tx(9, "supermercato", 99999), tx(8, "stipendio", 100000, "income")];
    expect(averageByCategory(data, range)).toEqual({ supermercato: 30033 });
  });

  it("suggests round limits", () => {
    expect(suggestLimitMinor(30033)).toBe(31000);
    expect(suggestLimitMinor(30000)).toBe(30000);
    expect(suggestLimitMinor(0)).toBe(0);
  });

  it("flags categories near or over their limit", () => {
    const rows = budgetRows({ supermercato: 40000, alimentazione: 15000, trasporti: 12000, shopping: 0 }, { supermercato: 312, alimentazione: 168, trasporti: 54 });
    expect(rows.map((row) => [row.category, row.status])).toEqual([
      ["alimentazione", "over"], ["supermercato", "ok"], ["trasporti", "ok"],
    ]);
    expect(budgetRows({ supermercato: 40000 }, { supermercato: 320 })[0].status).toBe("near");
  });
});
