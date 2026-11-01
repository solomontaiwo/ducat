import { describe, expect, it } from "vitest";
import en from "../src/locales/en/translation.json";
import it_ from "../src/locales/it/translation.json";
import { MoneyError, parseMoneyToMinor } from "../src/utils/money.js";

const flatten = (object, prefix = "") => Object.entries(object).flatMap(([key, value]) =>
  value && typeof value === "object" ? flatten(value, `${prefix}${key}.`) : [`${prefix}${key}`]);

describe("translations", () => {
  it("define the same keys in Italian and English", () => {
    const italian = new Set(flatten(it_));
    const english = new Set(flatten(en));
    expect([...italian].filter((key) => !english.has(key))).toEqual([]);
    expect([...english].filter((key) => !italian.has(key))).toEqual([]);
  });

  it("have a translation for every money and validation error key", () => {
    const keys = new Set(flatten(en));
    ["money.decimals", "money.notFinite", "money.notPositive", "money.tooLarge", "money.invalid",
      "validation.profileNameMin", "validation.profileNameMax", "validation.invalidEmail",
      "validation.passwordMin", "validation.passwordMismatch", "validation.invalidTransaction"]
      .forEach((key) => expect(keys.has(key), key).toBe(true));
  });
});

describe("money errors", () => {
  it.each([
    ["1.2345", "money.decimals"],
    [Number.NaN, "money.notFinite"],
    ["0", "money.notPositive"],
    [2_000_000, "money.tooLarge"],
  ])("expose a stable i18n key for %s", (value, key) => {
    try {
      parseMoneyToMinor(value);
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(MoneyError);
      expect(error.i18nKey).toBe(key);
    }
  });
});
