import { addMonths, addWeeks, addYears, differenceInCalendarDays, format } from "date-fns";
import { dateKeyToDate, DATE_KEY_FORMAT } from "./dateUtils.js";

export const FREQUENCIES = ["weekly", "monthly", "yearly"];
/** Upper bound on occurrences registered in one go (e.g. after months away). */
export const MAX_CATCH_UP = 24;

const STEP = { weekly: addWeeks, monthly: addMonths, yearly: addYears };

/**
 * Date of the n-th occurrence. Always computed from the anchor so a rule set on
 * the 31st lands on the last day of shorter months and returns to the 31st.
 */
export const occurrenceDateKey = (anchorDateKey, frequency, index) => {
  const step = STEP[frequency];
  if (!step) throw new Error(`Unknown frequency: ${frequency}`);
  return format(step(dateKeyToDate(anchorDateKey), index), DATE_KEY_FORMAT);
};

export const nextOccurrence = (rule) => ({
  index: rule.nextIndex,
  dateKey: occurrenceDateKey(rule.anchorDateKey, rule.frequency, rule.nextIndex),
});

/** Occurrences whose date has arrived and that have not been registered yet. */
export const dueOccurrences = (rule, todayKey, max = MAX_CATCH_UP) => {
  if (rule.paused) return [];
  const due = [];
  for (let index = rule.nextIndex; due.length < max; index += 1) {
    const dateKey = occurrenceDateKey(rule.anchorDateKey, rule.frequency, index);
    if (dateKey > todayKey) break;
    due.push({ index, dateKey });
  }
  return due;
};

/**
 * Rules that need attention soon: overdue ones waiting for confirmation and
 * every active rule due within `days`. Sorted by date.
 */
export const upcomingOccurrences = (rules, todayKey, days = 7) => {
  const today = dateKeyToDate(todayKey);
  return rules
    .filter((rule) => !rule.paused)
    .map((rule) => {
      const next = nextOccurrence(rule);
      return { rule, ...next, daysAway: differenceInCalendarDays(dateKeyToDate(next.dateKey), today) };
    })
    .filter((item) => item.daysAway <= days && (item.daysAway >= 0 || item.rule.mode === "confirm"))
    .sort((first, second) => first.dateKey.localeCompare(second.dateKey));
};

/** Average amount per month in minor units, for the "fixed per month" totals. */
export const monthlyEquivalentMinor = (rule) => {
  if (rule.frequency === "weekly") return Math.round((rule.amountMinor * 52) / 12);
  if (rule.frequency === "yearly") return Math.round(rule.amountMinor / 12);
  return rule.amountMinor;
};

/** Deterministic request id: the same occurrence never becomes two movements. */
export const occurrenceRequestId = (ruleId, dateKey) => `rec-${ruleId}-${dateKey}`;

/** First occurrence index dated today or later: resuming a paused rule skips the gap. */
export const firstIndexFrom = (rule, todayKey, limit = 10000) => {
  let index = rule.nextIndex;
  while (index < limit && occurrenceDateKey(rule.anchorDateKey, rule.frequency, index) < todayKey) index += 1;
  return index;
};
