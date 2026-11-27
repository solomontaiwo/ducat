import { useCallback, useMemo, useState } from "react";
import { addMonths, isSameMonth } from "date-fns";
import { usePlanning } from "../context/PlanningProvider.jsx";
import { cycleMonthFor, cycleRange } from "../utils/monthCycle.js";

/**
 * Keeps the selected "month" and exposes its boundaries. A month follows the
 * user's chosen start day (payday), so October may run 27 Sep – 26 Oct.
 * Allows stepping up to 12 months ahead to inspect planned/future movements.
 */
const MAX_FUTURE_MONTHS = 12;

export const useMonthRange = (initialMonth = null) => {
  const { preferences } = usePlanning();
  const startDay = preferences?.monthStartDay || 1;
  const currentMonth = cycleMonthFor(new Date(), startDay);
  const maxMonth = addMonths(currentMonth, MAX_FUTURE_MONTHS);
  // null = follow the current cycle, so changing the start day moves with it.
  const [selected, setSelected] = useState(() => (
    initialMonth && !isSameMonth(initialMonth, currentMonth) && initialMonth <= maxMonth
      ? initialMonth
      : null
  ));
  const month = selected || currentMonth;

  const goToPrevious = useCallback(() => setSelected((value) => {
    const current = cycleMonthFor(new Date(), startDay);
    const prev = addMonths(value || current, -1);
    return isSameMonth(prev, current) ? null : prev;
  }), [startDay]);
  const goToNext = useCallback(() => setSelected((value) => {
    const current = cycleMonthFor(new Date(), startDay);
    const limit = addMonths(current, MAX_FUTURE_MONTHS);
    const next = addMonths(value || current, 1);
    if (next > limit) return value;
    return isSameMonth(next, current) ? null : next;
  }), [startDay]);

  const monthKey = month.getTime();
  return useMemo(() => {
    const { startDate, endDate } = cycleRange(month, startDay);
    return {
      month,
      setMonth: setSelected,
      startDate,
      endDate,
      startDay,
      isCurrentMonth: isSameMonth(month, currentMonth),
      canGoNext: month < maxMonth,
      goToPrevious,
      goToNext,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey, startDay, goToPrevious, goToNext]);
};
