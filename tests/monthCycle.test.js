import { describe, expect, it } from "vitest";
import { cycleMonthFor, cycleRange, suggestMonthStartDay } from "../src/utils/monthCycle.js";

const ymd = (date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

describe("month cycles", () => {
  it("is the calendar month when the cycle starts on the 1st", () => {
    const range = cycleRange(new Date(2026, 9, 15), 1);
    expect(ymd(range.startDate)).toBe("2026-10-1");
    expect(ymd(range.endDate)).toBe("2026-10-31");
  });

  it("names a payday cycle after the month in which it ends", () => {
    const range = cycleRange(new Date(2026, 9, 1), 27);
    expect(ymd(range.startDate)).toBe("2026-9-27");
    expect(ymd(range.endDate)).toBe("2026-10-26");
    expect(range.endDate.getHours()).toBe(23);
  });

  it("clamps a start day to short months", () => {
    const march = cycleRange(new Date(2026, 2, 1), 31);
    expect(ymd(march.startDate)).toBe("2026-2-28");
    expect(ymd(march.endDate)).toBe("2026-3-30");
  });

  it("finds the cycle a date belongs to", () => {
    expect(ymd(cycleMonthFor(new Date(2026, 9, 9), 27))).toBe("2026-10-1");
    expect(ymd(cycleMonthFor(new Date(2026, 9, 27), 27))).toBe("2026-11-1");
    expect(ymd(cycleMonthFor(new Date(2026, 9, 27), 1))).toBe("2026-10-1");
    expect(ymd(cycleMonthFor(new Date(2026, 1, 28), 31))).toBe("2026-3-1");
  });

  it("suggests the usual salary day", () => {
    const pay = (month, day) => ({ type: "income", category: "stipendio", date: new Date(2026, month, day) });
    expect(suggestMonthStartDay([pay(7, 27), pay(8, 27), pay(9, 26)])).toBe(27);
    expect(suggestMonthStartDay([pay(7, 27)])).toBeNull();
    expect(suggestMonthStartDay([pay(7, 1), pay(8, 1)])).toBeNull();
  });
});
