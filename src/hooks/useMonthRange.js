import { useCallback, useMemo, useState } from "react";
import { addMonths, isSameMonth } from "date-fns";
import { usePlanning } from "../context/PlanningProvider.jsx";
import { cycleMonthFor, cycleRange } from "../utils/monthCycle.js";

/**
 * Keeps the selected "month" and exposes its boundaries. A month follows the
 * user's chosen start day (payday), so October may run 27 Sep – 26 Oct.
 * Navigation stops at the current month: there is nothing to show ahead.
 */
export const useMonthRange = () => {
  const { preferences } = usePlanning();
  const startDay = preferences?.monthStartDay || 1;
  const currentMonth = cycleMonthFor(new Date(), startDay);
  // null = follow the current cycle, so changing the start day moves with it.
  const [selected, setSelected] = useState(null);
  const month = selected || currentMonth;

  const goToPrevious = useCallback(() => setSelected((value) => addMonths(value || cycleMonthFor(new Date(), startDay), -1)), [startDay]);
  const goToNext = useCallback(() => setSelected((value) => {
    const current = cycleMonthFor(new Date(), startDay);
    if (!value) return null;
    const next = addMonths(value, 1);
    return isSameMonth(next, current) || next > current ? null : next;
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
      goToPrevious,
      goToNext,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey, startDay, goToPrevious, goToNext]);
};
