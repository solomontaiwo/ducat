import { useMemo, useState } from 'react';
import { isWithinInterval } from 'date-fns';
import { transactionComparator } from '../utils/transactionOrder.js';
import { matchesSearch, MIN_SEARCH_LENGTH } from '../utils/transactionSearch.js';

const parseAmountBound = (raw) => {
  const trimmed = String(raw || "").trim().replace(",", ".");
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) && num >= 0 ? num : null;
};

/**
 * Filters for the movements list. While a search is active it runs over
 * `searchSource` (the whole history) and ignores the selected month.
 */
export const useTransactionFilter = (
  transactions,
  dateRange,
  { searchSource = null, getCategoryLabel, initialCategory = "all", initialType = "all" } = {}
) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(initialCategory || "all");
  const [selectedType, setSelectedType] = useState(initialType || "all");
  const [sortBy, setSortBy] = useState("date-desc");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");

  const isSearching = searchTerm.trim().length >= MIN_SEARCH_LENGTH;

  const filteredTransactions = useMemo(() => {
    const source = searchTerm.trim() && searchSource ? searchSource : transactions;
    if (!source || source.length === 0) return [];

    const { startDate, endDate } = dateRange;
    const min = parseAmountBound(minAmount);
    const max = parseAmountBound(maxAmount);
    const filtered = source.filter((transaction) => {
      if (!isSearching && (startDate || endDate)) {
        if (!transaction.date) return false;
        if (startDate && endDate) {
          if (!isWithinInterval(transaction.date, { start: startDate, end: endDate })) return false;
        } else if (startDate && transaction.date < startDate) {
          return false;
        } else if (endDate && transaction.date > endDate) {
          return false;
        }
      }
      if (searchTerm.trim() && !matchesSearch(transaction, searchTerm, getCategoryLabel)) return false;
      if (selectedCategory !== "all" && transaction.category !== selectedCategory) return false;
      if (selectedType !== "all" && transaction.type !== selectedType) return false;
      if (min !== null && transaction.amount < min) return false;
      if (max !== null && transaction.amount > max) return false;
      return true;
    });

    return filtered.sort(transactionComparator(sortBy));
  }, [transactions, searchSource, isSearching, dateRange, searchTerm, selectedCategory, selectedType, sortBy, minAmount, maxAmount, getCategoryLabel]);

  return {
    filteredTransactions,
    searchTerm,
    setSearchTerm,
    isSearching,
    selectedCategory,
    setSelectedCategory,
    selectedType,
    setSelectedType,
    sortBy,
    setSortBy,
    minAmount,
    setMinAmount,
    maxAmount,
    setMaxAmount,
  };
};
