import { describe, expect, it } from "vitest";
import { createPDFReport } from "../src/utils/pdfUtils.jsx";

const tx = (id, type, amount, day) => ({
  id, type, amount, amountMinor: Math.round(amount * 100), category: type === "income" ? "stipendio" : "supermercato",
  description: `desc-${id}`, date: new Date(2026, 9, day, 12),
});

describe("createPDFReport", () => {
  it("builds a report without throwing (regression: invalid currency code)", () => {
    const { doc, model } = createPDFReport({
      transactions: [tx("a", "income", 2500, 1), tx("b", "expense", 42.3, 2), tx("c", "expense", 1234.56, 3)],
      startDate: new Date(2026, 9, 1),
      endDate: new Date(2026, 9, 31),
      periodLabel: "Ottobre 2026",
      lang: "it",
    });
    expect(model.transactions).toHaveLength(3);
    expect(doc.internal.getNumberOfPages()).toBeGreaterThan(1);
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(1000);
  });
});
