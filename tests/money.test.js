import { describe, expect, it } from "vitest";
import { getTransactionAmountMinor, minorToMajor, parseMoneyToMinor } from "../src/utils/money.js";

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

  it("reads legacy amounts using documented cent rounding", () => {
    expect(getTransactionAmountMinor({ amount: 10.129 })).toBe(1013);
    expect(getTransactionAmountMinor({ amount: 99, amountMinor: 1234 })).toBe(1234);
  });
});
