import { describe, expect, it } from "vitest";
import {
  dueOccurrences, monthlyEquivalentMinor, nextOccurrence, occurrenceDateKey, occurrenceRequestId, upcomingOccurrences,
} from "../src/utils/recurrence.js";

const rule = (overrides = {}) => ({
  id: "r1", anchorDateKey: "2026-01-31", frequency: "monthly", nextIndex: 1, mode: "auto", paused: false, amountMinor: 1200, ...overrides,
});

describe("recurrence", () => {
  it("keeps the anchor day across short months", () => {
    expect(occurrenceDateKey("2026-01-31", "monthly", 1)).toBe("2026-02-28");
    expect(occurrenceDateKey("2026-01-31", "monthly", 2)).toBe("2026-03-31");
    expect(occurrenceDateKey("2026-10-09", "weekly", 2)).toBe("2026-10-23");
    expect(occurrenceDateKey("2024-02-29", "yearly", 1)).toBe("2025-02-28");
  });

  it("lists every occurrence that has arrived, capped", () => {
    expect(dueOccurrences(rule(), "2026-04-15").map((item) => item.dateKey)).toEqual(["2026-02-28", "2026-03-31"]);
    expect(dueOccurrences(rule(), "2026-02-27")).toEqual([]);
    expect(dueOccurrences(rule({ paused: true }), "2026-04-15")).toEqual([]);
    expect(dueOccurrences(rule({ frequency: "weekly", anchorDateKey: "2020-01-01" }), "2026-01-01", 5)).toHaveLength(5);
  });

  it("returns the next occurrence", () => {
    expect(nextOccurrence(rule({ nextIndex: 3 }))).toEqual({ index: 3, dateKey: "2026-04-30" });
  });

  it("shows upcoming rules within the window and overdue ones awaiting confirmation", () => {
    const rules = [
      rule({ id: "soon", anchorDateKey: "2026-09-12" }),
      rule({ id: "far", anchorDateKey: "2026-09-30" }),
      rule({ id: "overdue-confirm", anchorDateKey: "2026-09-01", mode: "confirm" }),
      rule({ id: "overdue-auto", anchorDateKey: "2026-09-01" }),
      rule({ id: "paused", anchorDateKey: "2026-09-10", paused: true }),
    ];
    expect(upcomingOccurrences(rules, "2026-10-09").map((item) => item.rule.id)).toEqual(["overdue-confirm", "soon"]);
  });

  it("converts amounts to a monthly equivalent", () => {
    expect(monthlyEquivalentMinor(rule({ frequency: "weekly", amountMinor: 1200 }))).toBe(5200);
    expect(monthlyEquivalentMinor(rule({ frequency: "yearly", amountMinor: 1200 }))).toBe(100);
  });

  it("builds a stable request id", () => {
    expect(occurrenceRequestId("abc", "2026-10-09")).toBe("rec-abc-2026-10-09");
  });
});

describe("resuming a paused rule", () => {
  it("skips the occurrences that fell in the pause", async () => {
    const { firstIndexFrom } = await import("../src/utils/recurrence.js");
    const paused = { anchorDateKey: "2026-01-10", frequency: "monthly", nextIndex: 2 };
    expect(firstIndexFrom(paused, "2026-06-11")).toBe(6);
    expect(firstIndexFrom(paused, "2026-02-01")).toBe(2);
  });
});
