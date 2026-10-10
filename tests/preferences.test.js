import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, normalizePreferences } from "../src/schemas/planning.js";
import { orderCategories } from "../src/utils/categories.jsx";

describe("preferences", () => {
  it("fills in defaults and keeps valid fields when others are broken", () => {
    expect(normalizePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
    const result = normalizePreferences({ monthStartDay: 27, quickAmounts: "nope", hiddenCategories: ["viaggi"] });
    expect(result.monthStartDay).toBe(27);
    expect(result.hiddenCategories).toEqual(["viaggi"]);
    expect(result.quickAmounts).toEqual(DEFAULT_PREFERENCES.quickAmounts);
    expect(normalizePreferences({ monthStartDay: 99 }).monthStartDay).toBe(1);
  });

  it("orders categories by preference and keeps 'altro' last", () => {
    const list = ["a", "b", "altro", "c"].map((value) => ({ value }));
    expect(orderCategories(list, ["c", "altro", "a"]).map((item) => item.value)).toEqual(["c", "a", "b", "altro"]);
    expect(orderCategories(list, []).map((item) => item.value)).toEqual(["a", "b", "c", "altro"]);
  });
});
