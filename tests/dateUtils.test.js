import { describe, expect, it } from "vitest";
import { dateKeyToDate, dateKeyToUtcDate, dateToDateKey } from "../src/utils/dateUtils.js";

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
});
