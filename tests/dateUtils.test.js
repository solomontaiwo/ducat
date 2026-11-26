import { describe, expect, it } from "vitest";
import { dateKeyToDate, dateKeyToUtcDate, dateToDateKey, todayDateKey } from "../src/utils/dateUtils.js";

describe("civil date helpers", () => {
  it("round-trips a date key", () => {
    expect(dateToDateKey(dateKeyToDate("2026-03-29"))).toBe("2026-03-29");
    expect(dateKeyToUtcDate("2026-03-29").toISOString()).toBe("2026-03-29T00:00:00.000Z");
  });

  it("preserves legacy midnight UTC dates", () => {
    expect(dateToDateKey(new Date("2026-12-31T00:00:00.000Z"))).toBe("2026-12-31");
  });

  it("rejects impossible dates", () => {
    expect(() => dateKeyToDate("2026-02-31")).toThrow();
  });

  it("parses keys as local noon, including leap days", () => {
    const leap = dateKeyToDate("2028-02-29");
    expect([leap.getFullYear(), leap.getMonth(), leap.getDate(), leap.getHours()]).toEqual([2028, 1, 29, 12]);
    expect(dateToDateKey(dateKeyToDate("1999-12-31"))).toBe("1999-12-31");
    expect(() => dateKeyToDate("2027-02-29")).toThrow();
    expect(() => dateKeyToDate("2026-13-01")).toThrow();
  });

  it("formats local dates and today as yyyy-MM-dd", () => {
    expect(dateToDateKey(new Date(2026, 0, 5, 18, 30))).toBe("2026-01-05");
    const now = new Date();
    expect(todayDateKey()).toBe(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
  });
});
