const normalizeDescription = (value = "") => value.trim().toLowerCase();
const AMOUNT_BUCKET_SIZE = 5;
const VARIANCE_THRESHOLD = 120;
const MIN_CONFIDENCE_THRESHOLD = 0.45;
const normalizeAmountBucket = (value) =>
  Math.round(Number(value) / AMOUNT_BUCKET_SIZE) * AMOUNT_BUCKET_SIZE;

const dayDiff = (a, b) => {
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.round(Math.abs((a.getTime() - b.getTime()) / oneDay));
};

const estimateFrequency = (interval) => {
  // Approximate ranges for recurring household charges:
  // <=8d weekly, <=16d biweekly, <=40d monthly, else irregular cadence.
  if (interval <= 8) return "weekly";
  if (interval <= 16) return "biweekly";
  if (interval <= 40) return "monthly";
  return "irregular";
};

export const RecurringDetectionService = {
  detectRecurring(transactions, minOccurrences = 3) {
    const expenses = transactions
      .filter((t) => t.type === "expense")
      .map((t) => ({ ...t, date: t.date instanceof Date ? t.date : new Date(t.date) }));

    const groups = new Map();
    expenses.forEach((transaction) => {
      const amountBucket = normalizeAmountBucket(transaction.amount);
      const key = `${normalizeDescription(transaction.description)}|${transaction.category}|${amountBucket}`;
      const current = groups.get(key) || [];
      current.push(transaction);
      groups.set(key, current);
    });

    return Array.from(groups.values())
      .map((group) => group.sort((a, b) => a.date - b.date))
      .filter((group) => group.length >= minOccurrences)
      .map((group) => {
        const intervals = [];
        for (let i = 1; i < group.length; i += 1) {
          intervals.push(dayDiff(group[i].date, group[i - 1].date));
        }

        const avgInterval = intervals.reduce((sum, n) => sum + n, 0) / intervals.length;
        const variance =
          intervals.reduce((sum, n) => sum + (n - avgInterval) ** 2, 0) /
          (intervals.length || 1);
        const confidence = Math.max(0, Math.min(1, 1 - variance / VARIANCE_THRESHOLD));
        const lastDate = group[group.length - 1].date;
        const nextDate = new Date(lastDate);
        nextDate.setDate(nextDate.getDate() + Math.round(avgInterval || 30));

        return {
          id: `${group[0].category}-${Math.round(group[0].amount)}-${normalizeDescription(
            group[0].description
          )}`,
          category: group[0].category,
          description: group[0].description,
          amount: group[0].amount,
          occurrences: group.length,
          frequency: estimateFrequency(avgInterval),
          confidence,
          nextDueDate: nextDate,
        };
      })
      .filter((pattern) => pattern.confidence >= MIN_CONFIDENCE_THRESHOLD)
      .sort((a, b) => b.confidence - a.confidence);
  },
};
