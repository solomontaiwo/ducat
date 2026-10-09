import { useMemo, useState } from 'react';
import { isWithinInterval } from 'date-fns';
import { matchesSearch, MIN_SEARCH_LENGTH } from '../utils/transactionSearch.js';

/**
 * Filters for the movements list. While a search is active it runs over
 * `searchSource` (the whole history) and ignores the selected month.
 */
export const useTransactionFilter = (transactions, dateRange, { searchSource = null, getCategoryLabel } = {}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedType, setSelectedType] = useState("all");

  const isSearching = searchTerm.trim().length >= MIN_SEARCH_LENGTH;

  const filteredTransactions = useMemo(() => {
    const source = isSearching && searchSource ? searchSource : transactions;
    if (!source || source.length === 0) return [];

    const { startDate, endDate } = dateRange;
    const sorted = [...source].sort((a, b) => b.date - a.date);

    return sorted.filter((transaction) => {
      if (!isSearching && startDate && endDate) {
        if (!transaction.date || !isWithinInterval(transaction.date, { start: startDate, end: endDate })) {
          return false;
        }
      }
      if (searchTerm.trim() && !matchesSearch(transaction, searchTerm, getCategoryLabel)) return false;
      if (selectedCategory !== "all" && transaction.category !== selectedCategory) return false;
      if (selectedType !== "all" && transaction.type !== selectedType) return false;
      return true;
    });
  }, [transactions, searchSource, isSearching, dateRange, searchTerm, selectedCategory, selectedType, getCategoryLabel]);

  return {
    filteredTransactions,
    searchTerm,
    setSearchTerm,
    isSearching,
    selectedCategory,
    setSelectedCategory,
    selectedType,
    setSelectedType,
  };
};
