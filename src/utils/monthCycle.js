import { addDays, addMonths, endOfDay, endOfMonth, getDaysInMonth, startOfDay, startOfMonth } from "date-fns";

/**
 * "Months" that start on a chosen day (e.g. the 27th, payday). A cycle is
 * named after the calendar month in which it ends: with day 27, "October"
 * runs from 27 September to 26 October. Day 1 is the plain calendar month.
 */

const boundaryIn = (month, startDay) => {
  const day = Math.min(startDay, getDaysInMonth(month));
  return new Date(month.getFullYear(), month.getMonth(), day);
};

/** Start and end of the cycle named after `month`. */
export const cycleRange = (month, startDay = 1) => {
  const named = startOfMonth(month);
  if (!startDay || startDay <= 1) return { startDate: named, endDate: endOfMonth(named) };
  return {
    startDate: startOfDay(boundaryIn(addMonths(named, -1), startDay)),
    endDate: endOfDay(addDays(boundaryIn(named, startDay), -1)),
  };
};

/** The (first day of the) month that names the cycle containing `date`. */
export const cycleMonthFor = (date = new Date(), startDay = 1) => {
  const month = startOfMonth(date);
  if (!startDay || startDay <= 1) return month;
  return startOfDay(date) >= boundaryIn(month, startDay) ? addMonths(month, 1) : month;
};

/** Most frequent day of the month among salary payments, if there is a clear one. */
export const suggestMonthStartDay = (transactions = []) => {
  const counts = new Map();
  transactions.forEach((item) => {
    if (item.type !== "income" || item.category !== "stipendio" || !item.date) return;
    const day = item.date.getDate();
    counts.set(day, (counts.get(day) || 0) + 1);
  });
  const [best] = [...counts.entries()].sort((first, second) => second[1] - first[1]);
  if (!best || best[1] < 2 || best[0] === 1) return null;
  return best[0];
};
