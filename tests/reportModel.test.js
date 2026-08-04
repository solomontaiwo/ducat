import { describe, expect, it } from "vitest";
import { buildReportModel } from "../src/utils/reportModel.js";
import { dateKeyToDate } from "../src/utils/dateUtils.js";
import { calculateStats } from "../src/utils/statsUtils.jsx";

const transaction = (id, type, amountMinor, dateKey, category = "altro") => ({
  id,
  type,
  amountMinor,
  amount: amountMinor / 100,
  dateKey,
  date: dateKeyToDate(dateKey),
  category,
  description: id,
});

describe("report model", () => {
  it("filters inclusively and computes exact category averages", () => {
    const model = buildReportModel([
      transaction("a", "expense", 10, "2026-08-01", "casa"),
      transaction("b", "expense", 20, "2026-08-02", "casa"),
      transaction("c", "income", 100, "2026-08-02", "casa"),
      transaction("outside", "expense", 999, "2026-07-31", "casa"),
    ], dateKeyToDate("2026-08-01"), dateKeyToDate("2026-08-02"));

    expect(model.totalExpense).toBe(0.3);
    expect(model.totalIncome).toBe(1);
    expect(model.balance).toBe(0.7);
    expect(model.categoryBreakdown[0]).toMatchObject({ category: "casa", count: 2, amount: 0.3, average: 0.15 });
    expect(model.transactions.map((item) => item.id)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate the input", () => {
    const input = [transaction("old", "expense", 1, "2026-08-01"), transaction("new", "expense", 1, "2026-08-02")];
    buildReportModel(input, dateKeyToDate("2026-08-01"), dateKeyToDate("2026-08-02"));
    expect(input.map((item) => item.id)).toEqual(["old", "new"]);
  });

  it("keeps report and page statistics aligned beyond the former 50-item limit", () => {
    const input = Array.from({ length: 75 }, (_, index) =>
      transaction(`tx-${index}`, index % 3 === 0 ? "income" : "expense", 10 + index, "2026-08-04", "casa")
    );
    const start = dateKeyToDate("2026-08-01");
    const end = dateKeyToDate("2026-08-31");
    const report = buildReportModel(input, start, end);
    const stats = calculateStats(input, start, end);

    expect(stats.transactionCount).toBe(75);
    expect(stats.totalIncome).toBe(report.totalIncome);
    expect(stats.totalExpense).toBe(report.totalExpense);
    expect(stats.balance).toBe(report.balance);
  });
});
