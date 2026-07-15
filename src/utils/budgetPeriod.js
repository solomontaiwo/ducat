export const getBudgetPeriodRange = (period = "monthly", now = new Date()) => {
  const end = new Date(now);
  let start;

  if (period === "weekly") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const daysSinceMonday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - daysSinceMonday);
  } else if (period === "yearly") {
    start = new Date(now.getFullYear(), 0, 1);
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return { start, end };
};

export const isInBudgetPeriod = (date, period, now = new Date()) => {
  const { start, end } = getBudgetPeriodRange(period, now);
  const transactionDate = date instanceof Date ? date : new Date(date);
  return transactionDate >= start && transactionDate <= end;
};
