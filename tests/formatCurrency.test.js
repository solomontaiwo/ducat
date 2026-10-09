import { describe, expect, it } from "vitest";
import formatCurrency, { formatSignedAmount } from "../src/utils/formatCurrency.jsx";

describe("formatCurrency", () => {
  it("formats euro amounts in Italian by default", () => {
    expect(formatCurrency(1234.5)).toMatch(/1\.234,50\s€/);
  });

  it("can be passed directly to Array.map (regression: PDF export crashed)", () => {
    const formatted = [10, 20.5].map(formatCurrency);
    expect(formatted).toHaveLength(2);
    expect(formatted[1]).toMatch(/20,50\s€/);
  });

  it("signs income and expenses", () => {
    expect(formatSignedAmount(5, "income")).toMatch(/^\+5,00\s€$/);
    expect(formatSignedAmount(5, "expense")).toMatch(/^−5,00\s€$/);
  });
});
