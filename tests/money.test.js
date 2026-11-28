import { describe, expect, it } from "vitest";
import { MAX_AMOUNT_MINOR, MoneyError, getTransactionAmountMinor, minorToMajor, parseMoneyToMinor } from "../src/utils/money.js";
import { setAccountCurrency } from "../src/utils/currency.js";

describe("money helpers", () => {
  it("parses decimal strings without floating point drift", () => {
    expect(parseMoneyToMinor("0,10") + parseMoneyToMinor("0.20")).toBe(30);
    expect(minorToMajor(30)).toBe(0.3);
  });

  it("accepts thousands separators in either convention", () => {
    expect(parseMoneyToMinor("1.234")).toBe(123400);
    expect(parseMoneyToMinor("1,234")).toBe(123400);
    expect(parseMoneyToMinor("1.234,56")).toBe(123456);
    expect(parseMoneyToMinor("1,234.56")).toBe(123456);
    expect(parseMoneyToMinor("1 234,56")).toBe(123456);
  });

  it.each(["1.0001", "1234.567", "-1", "abc", "1,2,3", Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid amount %s", (value) => {
    expect(() => parseMoneyToMinor(value)).toThrow();
  });

  it("ignores any currency symbol", () => {
    expect(parseMoneyToMinor("$12.50")).toBe(1250);
    expect(parseMoneyToMinor("12,50 €")).toBe(1250);
    expect(parseMoneyToMinor("£1,234.56")).toBe(123456);
  });

  it("accepts large amounts for currencies with a small unit, up to the shared ceiling", () => {
    expect(parseMoneyToMinor("250000000")).toBe(25_000_000_000);
    expect(parseMoneyToMinor(1_000_000_000_000)).toBe(MAX_AMOUNT_MINOR);
    expect(() => parseMoneyToMinor(1_000_000_000_000.01)).toThrow(MoneyError);
  });

  it("rejects decimals for an account currency without them", () => {
    setAccountCurrency("JPY");
    expect(parseMoneyToMinor("1500")).toBe(150000);
    expect(parseMoneyToMinor("1.500")).toBe(150000);
    expect(parseMoneyToMinor("1500.00")).toBe(150000);
    expect(() => parseMoneyToMinor("12,5")).toThrow(expect.objectContaining({ i18nKey: "money.noDecimals" }));
    expect(parseMoneyToMinor("12,5", { maxDecimals: 2 })).toBe(1250);
  });

  it("reads stored string amounts with two decimals whatever the account currency", () => {
    setAccountCurrency("JPY");
    expect(getTransactionAmountMinor({ amount: "12.50" })).toBe(1250);
  });

  it("reads legacy amounts using documented cent rounding", () => {
    expect(getTransactionAmountMinor({ amount: 10.129 })).toBe(1013);
    expect(getTransactionAmountMinor({ amount: 99, amountMinor: 1234 })).toBe(1234);
  });
});
