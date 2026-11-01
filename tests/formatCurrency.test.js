import { afterEach, describe, expect, it } from "vitest";
import formatCurrency, {
  formatCompactCurrency, formatSignedAmount, formatSignedCompact, moneyLocale, setMoneyLanguage,
} from "../src/utils/formatCurrency.jsx";

afterEach(() => setMoneyLanguage("it"));

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

  it("follows the requested language", () => {
    expect(moneyLocale("en")).toBe("en-GB");
    expect(moneyLocale("it-IT")).toBe("it-IT");
    expect(formatCurrency(1234.5, "en-GB")).toMatch(/€1,234\.50/);
    expect(formatSignedAmount(5, "income", "en")).toMatch(/^\+€5\.00$/);
  });

  it("follows the language set by the i18n layer", () => {
    setMoneyLanguage("en");
    expect(formatCurrency(1234.5)).toMatch(/€1,234\.50/);
    setMoneyLanguage("it");
    expect(formatCurrency(1234.5)).toMatch(/1\.234,50\s€/);
  });

  it("drops the cents only for whole amounts", () => {
    expect(formatCompactCurrency(10)).toMatch(/^10\s€$/);
    expect(formatCompactCurrency(10.5)).toMatch(/10,50\s€/);
    expect(formatCompactCurrency(10, "en")).toMatch(/^€10$/);
    expect(formatSignedCompact(10, "expense")).toMatch(/^−10\s€$/);
  });
});
