import { describe, expect, it } from "vitest";
import { buildAnalyticsCsv } from "../src/utils/analyticsExport.js";

const transaction = {
  dateKey: "2026-10-01",
  type: "income",
  description: "Stipendio",
  category: "stipendio",
  amount: 1234.5,
};

describe("buildAnalyticsCsv", () => {
  it("keeps the Italian labels by default", () => {
    const csv = buildAnalyticsCsv([transaction]);
    expect(csv).toContain('"Data","Tipo","Descrizione","Categoria","Importo"');
    expect(csv).toContain('"income"');
  });

  it("uses the localized headers and type labels when provided", () => {
    const csv = buildAnalyticsCsv([transaction], {
      headers: ["Date", "Type", "Description", "Category", "Amount"],
      typeLabels: { income: "Income", expense: "Expense" },
    });
    expect(csv).toContain('"Date","Type","Description","Category","Amount"');
    expect(csv).toContain('"Income"');
    expect(csv).toContain('"1234.50"');
  });
});
