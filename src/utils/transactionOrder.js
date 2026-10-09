/** Newest first; ties on the same date fall back to a stable ID order. */
export const compareTransactions = (first, second) => {
  const dateDifference = new Date(second.date).getTime() - new Date(first.date).getTime();
  return dateDifference || String(second.id || "").localeCompare(String(first.id || ""));
};
