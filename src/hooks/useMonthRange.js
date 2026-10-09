import { useCallback, useMemo, useState } from "react";
import { addMonths, endOfMonth, isSameMonth, startOfMonth } from "date-fns";

/**
 * Keeps a selected calendar month (defaults to the current one) and exposes its
 * boundaries. Navigation stops at the current month: there is nothing to show
 * in the future.
 */
export const useMonthRange = (initialMonth = new Date()) => {
  const [month, setMonth] = useState(() => startOfMonth(initialMonth));

  const goToPrevious = useCallback(() => setMonth((current) => startOfMonth(addMonths(current, -1))), []);
  const goToNext = useCallback(() => setMonth((current) => {
    if (isSameMonth(current, new Date())) return current;
    return startOfMonth(addMonths(current, 1));
  }), []);

  return useMemo(() => ({
    month,
    setMonth,
    startDate: startOfMonth(month),
    endDate: endOfMonth(month),
    isCurrentMonth: isSameMonth(month, new Date()),
    goToPrevious,
    goToNext,
  }), [month, goToPrevious, goToNext]);
};
