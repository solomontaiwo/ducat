import { describe, expect, it } from "vitest";
import { descriptionTokens, normalizeDescription, suggestCategory } from "../src/utils/categorySuggest.js";

const EXPENSE = ["supermercato", "alimentazione", "trasporti", "casa", "abbonamenti", "shopping", "salute", "intrattenimento", "viaggi", "tasse", "altro"];
const INCOME = ["stipendio", "freelance", "bonus", "vendite", "rimborso", "investimenti", "regalo", "altro"];

describe("categorySuggest", () => {
  it("normalizes accents, case and punctuation", () => {
    expect(normalizeDescription("  Caffè-Bar  Centrale! ")).toBe("caffe bar centrale");
    expect(descriptionTokens("POS 4471 Esselunga del centro")).toEqual(["esselunga", "centro"]);
  });

  it("prefers how the user classified similar movements", () => {
    const history = [
      { type: "expense", description: "Esselunga Milano", category: "shopping" },
      { type: "expense", description: "Esselunga", category: "shopping" },
      { type: "expense", description: "Esselunga", category: "supermercato" },
    ];
    expect(suggestCategory("esselunga", { type: "expense", history, categories: EXPENSE })).toEqual({ category: "shopping", source: "history", count: 2 });
  });

  it("ignores history of the other type, unknown categories and 'altro'", () => {
    const history = [
      { type: "income", description: "Netflix", category: "rimborso" },
      { type: "expense", description: "Netflix", category: "altro" },
      { type: "expense", description: "Netflix", category: "legacy" },
    ];
    expect(suggestCategory("Netflix", { type: "expense", history, categories: EXPENSE })).toEqual({ category: "abbonamenti", source: "keyword", count: 0 });
  });

  it("falls back to keywords, longest match first", () => {
    expect(suggestCategory("Amazon Prime", { type: "expense", categories: EXPENSE })?.category).toBe("abbonamenti");
    expect(suggestCategory("Amazon ordine 123", { type: "expense", categories: EXPENSE })?.category).toBe("shopping");
    expect(suggestCategory("Bonifico stipendio ottobre", { type: "income", categories: INCOME })?.category).toBe("stipendio");
  });

  it("returns null for short or unknown text", () => {
    expect(suggestCategory("ab", { type: "expense", categories: EXPENSE })).toBeNull();
    expect(suggestCategory("qwerty zxcv", { type: "expense", categories: EXPENSE })).toBeNull();
  });

  it("matches whole words only", () => {
    expect(suggestCategory("barbiere", { type: "expense", categories: EXPENSE })).toBeNull();
  });
});
