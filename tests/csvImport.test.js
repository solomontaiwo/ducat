import { describe, expect, it } from "vitest";
import {
  detectCsvColumns,
  mapCsvRowsToTransactions,
  parseCsvText,
  parseFlexibleAmount,
  parseFlexibleDateKey,
} from "../src/utils/csvImport.js";

describe("csvImport", () => {
  it("parses semicolon European bank CSVs, quoted fields and BOM", () => {
    const raw = '\uFEFFData;Descrizione;Importo\n24/11/2026;"Esselunga; Milano";-42,50 €\n25/11/2026;Stipendio;+1.850,00\n';
    const parsed = parseCsvText(raw);
    expect(parsed.delimiter).toBe(";");
    expect(parsed.headers).toEqual(["Data", "Descrizione", "Importo"]);
    expect(parsed.rows).toEqual([
      ["24/11/2026", "Esselunga; Milano", "-42,50 €"],
      ["25/11/2026", "Stipendio", "+1.850,00"],
    ]);

    const cols = detectCsvColumns(parsed.headers);
    expect(cols).toMatchObject({ date: 0, description: 1, amount: 2 });
  });

  it("parses flexible date and currency amount formats", () => {
    expect(parseFlexibleDateKey("2026-11-24T12:30:00Z")).toBe("2026-11-24");
    expect(parseFlexibleDateKey("24/11/2026")).toBe("2026-11-24");
    expect(parseFlexibleDateKey("24.11.2026")).toBe("2026-11-24");
    expect(parseFlexibleDateKey("invalid")).toBeNull();

    expect(parseFlexibleAmount("-12,50 €")).toEqual({ sign: "expense", amountMinor: 1250 });
    expect(parseFlexibleAmount("+1.234,56")).toEqual({ sign: "income", amountMinor: 123456 });
    expect(parseFlexibleAmount("(30.00)")).toEqual({ sign: "expense", amountMinor: 3000 });
    expect(parseFlexibleAmount("0")).toBeNull();
  });

  it("maps rows with auto-categorization, duplicate skipping and deterministic requestIds", () => {
    const rows = [
      ["24/11/2026", "Netflix", "-15,99"],
      ["25/11/2026", "Stipendio", "+2.000,00"],
      ["bad-date", "Broken", "-5,00"],
    ];
    const mapping = { date: 0, description: 1, amount: 2, debit: -1, credit: -1, category: -1, type: -1 };
    const existing = [
      { dateKey: "2026-11-25", type: "income", amountMinor: 200000, description: "Stipendio" },
    ];
    const result = mapCsvRowsToTransactions(rows, mapping, {
      existing,
      expenseCategories: [
        { value: "abbonamenti", label: "Abbonamenti" },
        { value: "altro", label: "Altro" },
      ],
      incomeCategories: [{ value: "stipendio", label: "Stipendio" }],
    });

    expect(result.skipped).toBe(1);
    expect(result.duplicates).toBe(1);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]).toMatchObject({
      type: "expense",
      amountMinor: 1599,
      description: "Netflix",
      category: "abbonamenti",
      dateKey: "2026-11-24",
    });
    expect(result.valid[0].clientRequestId).toMatch(/^csv-2026-11-24-/);
  });

  it("supports separate debit and credit columns", () => {
    const rows = [
      ["2026-11-20", "Caffè", "2,50", ""],
      ["2026-11-21", "Rimborso", "", "25,00"],
    ];
    const mapping = { date: 0, description: 1, amount: -1, debit: 2, credit: 3, category: -1, type: -1 };
    const result = mapCsvRowsToTransactions(rows, mapping, {
      expenseCategories: [{ value: "alimentazione", label: "Ristoranti e bar" }],
      incomeCategories: [{ value: "rimborso", label: "Rimborso" }],
    });
    expect(result.valid).toHaveLength(2);
    expect(result.valid[0]).toMatchObject({ type: "expense", amountMinor: 250 });
    expect(result.valid[1]).toMatchObject({ type: "income", amountMinor: 2500 });
  });
});
