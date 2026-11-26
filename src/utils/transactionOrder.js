/** Newest first; ties on the same date fall back to a stable ID order. */
export const compareTransactions = (first, second) => {
  const dateDifference = new Date(second.date).getTime() - new Date(first.date).getTime();
  return dateDifference || String(second.id || "").localeCompare(String(first.id || ""));
};

export const transactionComparator = (sortBy) => {
  if (sortBy === "amount-desc") return (a, b) => b.amount - a.amount || compareTransactions(a, b);
  if (sortBy === "amount-asc") return (a, b) => a.amount - b.amount || compareTransactions(a, b);
  return compareTransactions;
};
