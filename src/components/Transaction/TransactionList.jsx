import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useMediaQuery } from "react-responsive";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";
import { useAuth } from "../../context/AuthProvider.jsx";
import TransactionModal from "./TransactionModal.jsx";
import TransactionForm from "./TransactionForm.jsx";
import SwipeableTransactionCard from "./SwipeableTransactionCard.jsx";
import TransactionActionsDialog from "./TransactionActionsDialog.jsx";
import DeleteTransactionDialog from "./DeleteTransactionDialog.jsx";
import { readLocalValue, writeLocalValue } from "../../utils/storage.js";
import { transactionComparator } from "../../utils/transactionOrder.js";
import { formatGroupDate as formatGroupDateLabel, formatRowDate, groupNetAmount, groupTransactionsByDate } from "../../utils/transactionGrouping.js";
import { groupTransactionsByMonth, mergeTransactions } from "../../utils/transactionSearch.js";
import { FiCheckSquare, FiChevronDown, FiCopy, FiSearch, FiSliders, FiTrash2, FiX } from "react-icons/fi";
import { useCategories } from "../../utils/categories.jsx";
import { useTranslation } from "react-i18next";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import MonthSwitcher from "../ui/MonthSwitcher.jsx";
import { useMonthRange } from "../../hooks/useMonthRange.js";
import { useTransactionFilter } from "../../hooks/useTransactionFilter.jsx";
import { dateKeyToDate, isDateKey } from "../../utils/dateUtils.js";
import { formatSignedAmount } from "../../utils/formatCurrency.jsx";
import { cn } from "../../lib/utils.js";
import { useNotification } from "../../utils/notificationUtils";
import HeaderProfileButton from "../Layout/HeaderProfileButton.jsx";
import PullToRefresh from "../ui/PullToRefresh.jsx";
import { useOptionalLocation } from "../../router/RouterProvider";
import { dismissKeyboardOnEnter } from "../../platform/native.js";

const EMPTY_ROWS = [];
const TYPE_FILTERS = ["all", "expense", "income"];

const parseMonthParam = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) return null;
  const [year, monthIndex] = value.split("-").map(Number);
  if (monthIndex < 1 || monthIndex > 12) return null;
  return new Date(year, monthIndex - 1, 1);
};

const parseInitialFilters = (search) => {
  const params = new URLSearchParams(search || "");
  const rawType = params.get("type");
  const type = rawType === "expense" || rawType === "income" ? rawType : "all";
  const category = params.get("category")?.trim() || "all";
  const month = parseMonthParam(params.get("month"));
  const allTime = params.get("allTime") === "1";
  return { type, category, month, allTime };
};

const TransactionList = () => {
  const { t, i18n } = useTranslation();
  const notification = useNotification();
  const { currentUser, loading: authLoading } = useAuth();
  const {
    transactions, // This is the limited recent stream
    deleteTransaction,
    addTransaction,
    updateTransaction,
    isDemo,
    maxTransactions,
    fetchTransactionPage,
    getTotalTransactionCount,
    getTransactionTotals,
    fetchAllTransactions,
    recentRevision,
    syncOfflineQueue,
  } = useUnifiedTransactions();

  const { expenseCategories, incomeCategories } = useCategories();
  const isDesktop = useMediaQuery({ minWidth: 1024 });

  const [editTransaction, setEditTransaction] = useState(null);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [actionTransaction, setActionTransaction] = useState(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const hasSidebar = useMediaQuery({ minWidth: 768 });
  const [preferTable, setPreferTable] = useState(() => readLocalValue("ducat-transaction-view") === "table");
  const [tableFits, setTableFits] = useState(false);
  const measureList = useCallback((node) => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const fontSize = parseFloat(getComputedStyle(node).fontSize);
      setTableFits(entry.contentRect.width >= 40 * fontSize);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const [bulkBusy, setBulkBusy] = useState(false);

  const [allLoadedTransactions, setAllLoadedTransactions] = useState([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [pageCursor, setPageCursor] = useState(null);
  const [totalTransactionCount, setTotalTransactionCount] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [serverTotals, setServerTotals] = useState(null);
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const pageRevisionRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const loadedPageKey = useRef(null);

  const routerLocation = useOptionalLocation();
  const routeSearch = routerLocation ? routerLocation.search : (typeof window !== "undefined" ? window.location.search : "");
  const initialFilters = useMemo(() => parseInitialFilters(routeSearch), [routeSearch]);
  const monthRange = useMonthRange(initialFilters.month);
  const [allTime, setAllTime] = useState(initialFilters.allTime);
  const hasCustomDates = isDateKey(customFrom) || isDateKey(customTo);
  const { startDate, endDate } = useMemo(() => {
    if (hasCustomDates) {
      const start = isDateKey(customFrom) ? dateKeyToDate(customFrom) : null;
      const end = isDateKey(customTo) ? new Date(dateKeyToDate(customTo).setHours(23, 59, 59, 999)) : null;
      if (start && end && start > end) return { startDate: end, endDate: start };
      return { startDate: start, endDate: end };
    }
    if (allTime) return { startDate: null, endDate: null };
    return { startDate: monthRange.startDate, endDate: monthRange.endDate };
  }, [hasCustomDates, customFrom, customTo, allTime, monthRange.startDate, monthRange.endDate]);

  const getCategoryLabel = useCallback((category) => {
    const categoryData = [...expenseCategories, ...incomeCategories].find((c) => c.value === category);
    if (categoryData) return categoryData.label;
    return t(`categories.${category}`, { defaultValue: category });
  }, [expenseCategories, incomeCategories, t]);

  // Refresh the full-history search snapshot after every transaction revision.
  const [historyIndex, setHistoryIndex] = useState(null);
  const [historyRevision, setHistoryRevision] = useState(null);
  const [historyScope, setHistoryScope] = useState(null);
  const [historyOwner, setHistoryOwner] = useState(null);
  const userId = currentUser?.uid;
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [removedIds, setRemovedIds] = useState(() => new Set());
  // Deletes are optimistic: an id stays here while the undo toast is open, so
  // it must be hidden from the list source too (not only from the merged history).
  const baseTransactions = isDemo || (!loadedPageKey.current && allLoadedTransactions.length === 0)
    ? transactions
    : allLoadedTransactions;
  const visibleTransactions = useMemo(
    () => (removedIds.size ? baseTransactions.filter((item) => !removedIds.has(item.id)) : baseTransactions),
    [baseTransactions, removedIds],
  );
  const searchSource = useMemo(() => {
    if (isDemo) return visibleTransactions;
    return mergeTransactions(historyOwner === userId && historyRevision === recentRevision ? historyIndex || [] : [], transactions, removedIds);
  }, [isDemo, visibleTransactions, historyIndex, historyOwner, userId, historyRevision, recentRevision, transactions, removedIds]);

  const {
    filteredTransactions: matchingTransactions,
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
  } = useTransactionFilter(
    visibleTransactions,
    { startDate, endDate },
    {
      searchSource,
      getCategoryLabel,
      initialCategory: initialFilters.category,
      initialType: initialFilters.type,
    }
  );

  const hasSearch = Boolean(searchTerm.trim());
  const searchScope = isSearching ? "history" : `${startDate?.getTime() ?? "start"}:${endDate?.getTime() ?? "end"}`;
  const historyReady = historyOwner === userId && historyRevision === recentRevision && historyScope === searchScope;
  const pageFilters = useMemo(() => ({
    startDate, endDate, category: selectedCategory, type: selectedType,
  }), [startDate, endDate, selectedCategory, selectedType]);

  const pageKey = JSON.stringify([userId, startDate?.getTime() ?? null, endDate?.getTime() ?? null, selectedType, selectedCategory, sortBy]);
  const pageReady = loadedPageKey.current === pageKey;
  const resultsReady = isDemo || (hasSearch ? historyReady : pageReady);
  const filteredTransactions = resultsReady ? matchingTransactions : EMPTY_ROWS;

  // Apply drill-down query parameters if the user navigates here again with new filters.
  const appliedSearchRef = useRef(routeSearch);
  const setMonth = monthRange.setMonth;
  useEffect(() => {
    if (appliedSearchRef.current === routeSearch) return;
    appliedSearchRef.current = routeSearch;
    const next = parseInitialFilters(routeSearch);
    setSelectedType(next.type);
    setSelectedCategory(next.category);
    setAllTime(next.allTime);
    setMonth(next.month);
  }, [routeSearch, setSelectedType, setSelectedCategory, setMonth]);

  useEffect(() => {
    if (!hasSearch || isDemo || !userId) {
      setIsLoadingHistory(false);
      return undefined;
    }
    if (historyIndex && historyReady) {
      setIsLoadingHistory(false);
      return undefined;
    }
    let cancelled = false;
    setIsLoadingHistory(true);
    setLoadError("");
    fetchAllTransactions({ forceRefresh: true, ...(!isSearching && { startDate, endDate }) })
      .then((data) => {
        if (!cancelled) {
          setHistoryIndex(data);
          setHistoryScope(searchScope);
          setHistoryOwner(userId);
          setHistoryRevision(recentRevision);
          setIsLoadingHistory(false);
        }
      })
      .catch(() => { if (!cancelled) setLoadError(t("transactions.loadError")); })
      .finally(() => { if (!cancelled) setIsLoadingHistory(false); });
    return () => { cancelled = true; };
  }, [hasSearch, isSearching, isDemo, userId, historyIndex, historyReady, searchScope, startDate, endDate, recentRevision, reloadKey, fetchAllTransactions, t]);

  useEffect(() => {
    let cancelled = false;
    const fetchCount = async () => {
      try {
        if (currentUser && !isDemo) {
          const count = await getTotalTransactionCount(pageFilters);
          if (!cancelled) setTotalTransactionCount(count);
        } else if (isDemo) {
          setTotalTransactionCount(transactions.length);
        }
      } catch {
        if (!cancelled) setLoadError(t("transactions.countLoadError"));
      }
    };
    fetchCount();
    return () => { cancelled = true; };
  }, [currentUser, isDemo, getTotalTransactionCount, transactions, pageFilters, recentRevision, reloadKey, t]);

  // Keep totals attached to the filters that produced them while the next request runs.
  useEffect(() => {
    let cancelled = false;
    setServerTotals(null);
    if (!currentUser || isDemo || !getTransactionTotals) return undefined;
    getTransactionTotals(pageFilters)
      .then((totals) => { if (!cancelled) setServerTotals({ owner: userId, filters: pageFilters, values: totals }); })
      .catch(() => { if (!cancelled) setLoadError(t("transactions.countLoadError")); });
    return () => { cancelled = true; };
  }, [currentUser, isDemo, getTransactionTotals, pageFilters, recentRevision, reloadKey, t, userId]);

  // Reset to the first page in the selected order whenever the realtime
  // stream changes. This prevents stale cross-device deletions from surviving
  // in an independently merged history.
  useEffect(() => {
    let cancelled = false;
    pageRevisionRef.current += 1;
    loadingMoreRef.current = false;
    setIsLoadingMore(false);
    setIsLoadingAll(false);
    setHasMore(false);
    setPageCursor(null);
    const loadFirstPage = async () => {
      if (isDemo) {
        setAllLoadedTransactions(transactions);
        loadedPageKey.current = pageKey;
        setHasMore(false);
        return;
      }
      if (!currentUser) {
        setAllLoadedTransactions([]);
        return;
      }
      setIsLoadingInitial(true);
      setLoadError("");
      try {
        const page = await fetchTransactionPage({ pageSize: 40, ...pageFilters, sortBy });
        if (cancelled) return;
        setAllLoadedTransactions(page.items);
        loadedPageKey.current = pageKey;
        setPageCursor(page.nextCursor);
        setHasMore(page.hasMore);
      } catch (error) {
        if (!cancelled) setLoadError(error.code === "permission-denied"
          ? t("security.emailVerificationRequired")
          : t("transactions.loadError"));
      } finally {
        if (!cancelled) setIsLoadingInitial(false);
      }
    };
    loadFirstPage();
    return () => { cancelled = true; pageRevisionRef.current += 1; };
  }, [currentUser, fetchTransactionPage, isDemo, recentRevision, reloadKey, transactions, pageFilters, pageKey, sortBy, t]);

  const handleLoadMore = useCallback(async () => {
    if (!pageReady || loadingMoreRef.current || isLoadingInitial || !hasMore) return;
    const revision = pageRevisionRef.current;
    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    setLoadError("");
    try {
      const page = await fetchTransactionPage({ pageSize: 40, cursor: pageCursor, ...pageFilters, sortBy });
      if (revision !== pageRevisionRef.current) return;
      setAllLoadedTransactions((previous) => {
        const merged = new Map(previous.map((item) => [item.id, item]));
        page.items.forEach((item) => merged.set(item.id, item));
        return Array.from(merged.values()).sort(transactionComparator(sortBy));
      });
      setPageCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch {
      if (revision === pageRevisionRef.current) setLoadError(t("transactions.loadMoreError"));
    } finally {
      if (revision === pageRevisionRef.current) {
        loadingMoreRef.current = false;
        setIsLoadingMore(false);
      }
    }
  }, [fetchTransactionPage, hasMore, isLoadingInitial, pageReady, pageCursor, pageFilters, sortBy, t]);

  /** Loads the remaining pages using the active filters and ordering. */
  const handleLoadAll = useCallback(async () => {
    if (!pageReady || loadingMoreRef.current || isLoadingInitial || !hasMore) return;
    const revision = pageRevisionRef.current;
    loadingMoreRef.current = true;
    setIsLoadingAll(true);
    setLoadError("");
    let cursor = pageCursor;
    try {
      for (;;) {
        const page = await fetchTransactionPage({ pageSize: 200, cursor, ...pageFilters, sortBy });
        if (revision !== pageRevisionRef.current) return;
        setAllLoadedTransactions((previous) => {
          const merged = new Map(previous.map((item) => [item.id, item]));
          page.items.forEach((item) => merged.set(item.id, item));
          return Array.from(merged.values()).sort(transactionComparator(sortBy));
        });
        cursor = page.nextCursor;
        setPageCursor(page.nextCursor);
        setHasMore(page.hasMore);
        if (!page.hasMore) break;
      }
    } catch {
      if (revision === pageRevisionRef.current) setLoadError(t("transactions.loadMoreError"));
    } finally {
      if (revision === pageRevisionRef.current) {
        loadingMoreRef.current = false;
        setIsLoadingAll(false);
      }
    }
  }, [fetchTransactionPage, hasMore, isLoadingInitial, pageReady, pageCursor, pageFilters, sortBy, t]);

  const sentinelRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !isDemo && allLoadedTransactions.length > 0) {
          handleLoadMore();
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );
    const currentRef = sentinelRef.current;
    if (currentRef) observer.observe(currentRef);
    return () => {
      if (currentRef) observer.unobserve(currentRef);
    };
  }, [hasSearch, hasMore, isLoadingMore, isDemo, allLoadedTransactions.length, handleLoadMore]);

  // Keep the side panel in sync with the list (edits, deletions, period changes).
  useEffect(() => {
    if (!selectedTransaction) return;
    if (hasSearch && !isDemo && !historyReady) return;
    const fresh = (hasSearch ? searchSource : allLoadedTransactions).find((item) => item.id === selectedTransaction.id);
    if (!fresh) setSelectedTransaction(null);
    else if (fresh !== selectedTransaction) setSelectedTransaction(fresh);
  }, [allLoadedTransactions, hasSearch, isDemo, searchSource, selectedTransaction, historyReady]);

  const loading = authLoading || (isLoadingInitial && allLoadedTransactions.length === 0 && transactions.length === 0);

  const formatGroupDate = (date) => formatGroupDateLabel(date, i18n.language, t);

  const handleDeleteClick = useCallback((transactionId) => {
    setDeleteConfirm(transactionId);
  }, []);

  const duplicate = useCallback(async (transaction) => {
    if (!transaction) return false;
    return addTransaction({
      type: transaction.type,
      amount: transaction.amount,
      description: transaction.description,
      date: transaction.date,
      category: transaction.category,
    });
  }, [addTransaction]);

  const handleDuplicate = useCallback(async () => {
    if (await duplicate(actionTransaction)) setActionTransaction(null);
  }, [actionTransaction, duplicate]);

  const confirmDelete = useCallback(() => {
    const id = deleteConfirm;
    if (!id) return;
    setDeleteConfirm(null);
    setSelectedTransaction((current) => (current?.id === id ? null : current));

    // Hide the row immediately; commit the server delete when the undo toast closes.
    setRemovedIds((previous) => new Set(previous).add(id));
    let undone = false;

    // Closing the app during the undo window must not leave the row undeleted.
    const flushOnExit = (event) => {
      if (event.persisted || undone) return;
      window.removeEventListener("pagehide", flushOnExit);
      deleteTransaction(id, { silent: true });
    };
    window.addEventListener("pagehide", flushOnExit);
    const stopListening = () => window.removeEventListener("pagehide", flushOnExit);

    notification.success(t("notifications.deleteSuccess"), {
      duration: 6000,
      action: {
        label: t("notifications.undo"),
        onClick: () => {
          undone = true;
          stopListening();
          setRemovedIds((previous) => {
            const next = new Set(previous);
            next.delete(id);
            return next;
          });
        },
      },
      onClose: () => {
        stopListening();
        if (undone) return;
        deleteTransaction(id, { silent: true }).then((ok) => {
          if (!ok) {
            // The delete failed: bring the row back (the provider shows the error).
            setRemovedIds((previous) => {
              const next = new Set(previous);
              next.delete(id);
              return next;
            });
            return;
          }
          setAllLoadedTransactions((prev) => prev.filter((item) => item.id !== id));
        });
      },
    });
  }, [deleteConfirm, deleteTransaction, notification, t]);

  const transactionToDelete = deleteConfirm
    ? searchSource.find((item) => item.id === deleteConfirm) || allLoadedTransactions.find((item) => item.id === deleteConfirm) || transactions.find((item) => item.id === deleteConfirm)
    : null;

  const categories = useMemo(() => {
    const source = allLoadedTransactions.length > 0 ? allLoadedTransactions : transactions;
    const values = new Set([...expenseCategories, ...incomeCategories].map((item) => item.value));
    source.forEach((item) => values.add(item.category));
    if (selectedCategory && selectedCategory !== "all") values.add(selectedCategory);
    return [...values].sort((first, second) =>
      getCategoryLabel(first).localeCompare(getCategoryLabel(second)));
  }, [allLoadedTransactions, transactions, selectedCategory, getCategoryLabel, expenseCategories, incomeCategories]);

  const saveEdit = useCallback(async (target, payload) => {
    const success = await updateTransaction(target.id, payload);
    if (success) {
      setAllLoadedTransactions((prev) => prev.map((item) => (item.id === target.id ? { ...item, ...payload } : item)));
      setHistoryIndex((prev) => prev && prev.map((item) => (item.id === target.id ? { ...item, ...payload } : item)));
    }
    return success;
  }, [updateTransaction]);

  const handleModalSubmit = useCallback(async (payload) => {
    if (editTransaction) return saveEdit(editTransaction, payload);
    return addTransaction(payload);
  }, [addTransaction, editTransaction, saveEdit]);

  const handleSelect = useCallback((transaction) => {
    if (selectionMode) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(transaction.id)) next.delete(transaction.id);
        else next.add(transaction.id);
        return next;
      });
      return;
    }
    if (isDesktop) setSelectedTransaction(transaction);
    else setActionTransaction(transaction);
  }, [isDesktop, selectionMode]);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const selectedItems = useMemo(
    () => filteredTransactions.filter((item) => selectedIds.has(item.id)),
    [filteredTransactions, selectedIds]
  );

  const selectedTypes = useMemo(() => new Set(selectedItems.map((item) => item.type)), [selectedItems]);
  const hasMixedBulkTypes = selectedTypes.size > 1;
  const bulkCategories = useMemo(() => {
    if (selectedTypes.size === 1 && selectedTypes.has("income")) return incomeCategories;
    return expenseCategories;
  }, [selectedTypes, expenseCategories, incomeCategories]);

  const allVisibleSelected = filteredTransactions.length > 0 && filteredTransactions.every((item) => selectedIds.has(item.id));
  const toggleSelectAll = useCallback(() => {
    if (allVisibleSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredTransactions.map((item) => item.id)));
  }, [allVisibleSelected, filteredTransactions]);

  const handleBulkCategory = useCallback(async (nextCategory) => {
    if (!nextCategory || !selectedItems.length || bulkBusy || hasMixedBulkTypes) return;
    setBulkBusy(true);
    try {
      for (const item of selectedItems) {
        const ok = await updateTransaction(item.id, { category: nextCategory }, { silent: true });
        if (ok) {
          setAllLoadedTransactions((prev) => prev.map((row) => (row.id === item.id ? { ...row, category: nextCategory } : row)));
          setHistoryIndex((prev) => prev && prev.map((row) => (row.id === item.id ? { ...row, category: nextCategory } : row)));
        }
      }
      exitSelection();
    } finally {
      setBulkBusy(false);
    }
  }, [selectedItems, bulkBusy, hasMixedBulkTypes, updateTransaction, exitSelection]);

  const confirmBulkDelete = useCallback(() => {
    const ids = selectedItems.map((item) => item.id);
    setBulkDeleteConfirm(false);
    if (!ids.length) return;
    exitSelection();
    setSelectedTransaction((current) => (current && ids.includes(current.id) ? null : current));

    setRemovedIds((previous) => {
      const next = new Set(previous);
      ids.forEach((id) => next.add(id));
      return next;
    });
    let undone = false;

    const commitDeletes = async () => {
      for (const id of ids) {
        const ok = await deleteTransaction(id, { silent: true });
        if (!ok) {
          setRemovedIds((previous) => {
            const next = new Set(previous);
            next.delete(id);
            return next;
          });
        } else {
          setAllLoadedTransactions((prev) => prev.filter((item) => item.id !== id));
        }
      }
    };

    const flushOnExit = (event) => {
      if (event.persisted || undone) return;
      window.removeEventListener("pagehide", flushOnExit);
      ids.forEach((id) => deleteTransaction(id, { silent: true }));
    };
    window.addEventListener("pagehide", flushOnExit);
    const stopListening = () => window.removeEventListener("pagehide", flushOnExit);

    notification.success(t("transactions.bulk.deleted", { count: ids.length }), {
      duration: 6000,
      action: {
        label: t("notifications.undo"),
        onClick: () => {
          undone = true;
          stopListening();
          setRemovedIds((previous) => {
            const next = new Set(previous);
            ids.forEach((id) => next.delete(id));
            return next;
          });
        },
      },
      onClose: () => {
        stopListening();
        if (!undone) commitDeletes();
      },
    });
  }, [selectedItems, exitSelection, deleteTransaction, notification, t]);

  const loadedTotals = useMemo(() => filteredTransactions.reduce(
    (sum, item) => {
      if (item.type === "income") sum.income += item.amount;
      else sum.expense += item.amount;
      return sum;
    },
    { income: 0, expense: 0 }
  ), [filteredTransactions]);
  const hasAmountFilter = Boolean(minAmount.trim() || maxAmount.trim());
  const completeLocalRows = isDemo || (hasSearch ? historyReady : !hasMore && !isLoadingInitial && pageReady && !loadError);
  const exact = serverTotals?.filters === pageFilters && serverTotals.owner === userId ? serverTotals.values : null;
  const totals = !isDemo && !hasSearch && !hasAmountFilter && exact
    ? { count: exact.count, income: exact.incomeMinor / 100, expense: exact.expenseMinor / 100 }
    : completeLocalRows || hasAmountFilter ? { count: filteredTransactions.length, ...loadedTotals } : null;

  const handleRefresh = useCallback(async () => {
    if (isDemo || !currentUser) return;
    if (typeof navigator === "undefined" || navigator.onLine !== false) {
      await syncOfflineQueue?.();
      const { TransactionService } = await import("../../services/transactionService.jsx");
      TransactionService.invalidateCache();
    }
    setReloadKey((value) => value + 1);
  }, [isDemo, currentUser, syncOfflineQueue]);

  if (loading) {
    return (
      <div className="page-shell">
        <Skeleton height={44} width={220} borderRadius={12} />
        <Skeleton height={48} borderRadius={16} />
        {[...Array(3)].map((_, idx) => (
          <div key={idx} className="space-y-2">
            <Skeleton width={140} height={16} />
            <Skeleton height={140} borderRadius={18} />
          </div>
        ))}
      </div>
    );
  }

  if (!currentUser && !isDemo) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="space-y-3 text-center">
          <h2 className="text-2xl font-bold">{t("transactions.accessRequired")}</h2>
          <p className="text-muted-foreground">{t("transactions.loginRequired")}</p>
        </div>
      </div>
    );
  }

  const groupedTransactions = isSearching
    ? groupTransactionsByMonth(filteredTransactions, i18n.language)
    : groupTransactionsByDate(filteredTransactions, formatGroupDate);
  const isAmountSorted = sortBy !== "date-desc";
  const hasAdvancedActive = hasCustomDates || hasAmountFilter;
  const hasFilters = searchTerm || selectedCategory !== "all" || selectedType !== "all" || isAmountSorted || hasAdvancedActive;
  const showPanel = isDesktop && selectedTransaction && !selectionMode;
  const demoCount = transactions.filter((item) => !item.isSample).length;

  return (
    <PullToRefresh onRefresh={handleRefresh} disabled={loading} className="workspace-width">
    <div className="flex w-full gap-6">
      <div ref={measureList} className="min-w-0 flex-1 space-y-4">
        {loadError && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <span>{loadError}</span>
            <Button variant="outline" size="sm" onClick={() => setReloadKey((value) => value + 1)}>{t("common.retry")}</Button>
          </div>
        )}

        <header className="mobile-glass-header flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h1 className="pl-1 text-[1.75rem] font-extrabold leading-tight md:pl-0 md:text-3xl">{t("transactions.title")}</h1>
          <div className="max-sm:order-last max-sm:basis-full sm:ml-auto">
            <MonthSwitcher
              size="sm"
              month={monthRange.month}
              onPrevious={monthRange.goToPrevious}
              onNext={monthRange.goToNext}
              canGoNext={monthRange.canGoNext}
              disabled={allTime || isSearching || hasCustomDates}
              className="w-fit rounded-full border border-border bg-card px-0.5"
            />
          </div>
          <HeaderProfileButton />
        </header>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
          <label className="relative block min-w-0 flex-1">
            <span className="sr-only">{t("searchTransactions")}</span>
            <FiSearch className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              enterKeyHint="search"
              onKeyDown={dismissKeyboardOnEnter}
              className="h-12 w-full rounded-2xl border border-input bg-card pl-11 pr-4 text-base outline-none transition placeholder:text-muted-foreground/80 focus-visible:ring-2 focus-visible:ring-ring"
              placeholder={t("searchTransactions")}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              aria-describedby={isSearching ? "search-scope-help" : undefined}
            />
          </label>
          <button
            type="button"
            className="chip shrink-0"
            aria-pressed={showAdvancedFilters || hasAdvancedActive}
            onClick={() => setShowAdvancedFilters((open) => !open)}
            data-testid="toggle-advanced-filters"
          >
            <FiSliders className="h-3.5 w-3.5" aria-hidden="true" />
            {t("transactions.filters.advanced")}
            {hasAdvancedActive && <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />}
          </button>
          </div>
          {isSearching && (
            <p id="search-scope-help" className="px-1 text-xs font-medium text-muted-foreground" aria-live="polite">
              {isLoadingHistory ? t("transactions.searchLoading") : t("transactions.searchScope")}
            </p>
          )}

          <div className="scroll-row-bleed flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none md:mx-0 md:flex-wrap md:px-0" data-swipe-ignore="true">
            {TYPE_FILTERS.map((type) => (
              <button
                key={type}
                type="button"
                className="chip"
                aria-pressed={selectedType === type}
                onClick={() => setSelectedType(type)}
              >
                {t(`transactions.filters.type.${type}`)}
              </button>
            ))}
            <label className="relative shrink-0">
              <span className="sr-only">{t("transactions.filters.category")}</span>
              <select
                value={selectedCategory}
                onChange={(event) => setSelectedCategory(event.target.value)}
                data-active={selectedCategory !== "all"}
                className="chip appearance-none pr-9 text-sm"
              >
                <option value="all">{t("transactions.filters.allCategories")}</option>
                {categories.map((category) => (
                  <option key={category} value={category}>{getCategoryLabel(category)}</option>
                ))}
              </select>
              <FiChevronDown className={cn("pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2", selectedCategory !== "all" ? "text-background" : "text-muted-foreground")} aria-hidden="true" />
            </label>
            <label className="relative shrink-0">
              <span className="sr-only">{t("transactions.sort.label")}</span>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                data-active={isAmountSorted}
                className="chip appearance-none pr-9 text-sm"
                aria-label={t("transactions.sort.label")}
              >
                <option value="date-desc">{t("transactions.sort.dateDesc")}</option>
                <option value="amount-desc">{t("transactions.sort.amountDesc")}</option>
                <option value="amount-asc">{t("transactions.sort.amountAsc")}</option>
              </select>
              <FiChevronDown className={cn("pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2", isAmountSorted ? "text-background" : "text-muted-foreground")} aria-hidden="true" />
            </label>
            <button type="button" className="chip" aria-pressed={allTime || isSearching} disabled={isSearching} onClick={() => setAllTime((value) => !value)}>
              {t("transactions.filters.allTime")}
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={selectionMode}
              onClick={() => (selectionMode ? exitSelection() : setSelectionMode(true))}
              data-testid="toggle-bulk-select"
            >
              <FiCheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
              {t("transactions.bulk.select")}
            </button>
            {tableFits && (
              <button type="button" className="chip hidden md:inline-flex" aria-pressed={preferTable} onClick={() => {
                setPreferTable(!preferTable);
                writeLocalValue("ducat-transaction-view", preferTable ? "list" : "table");
              }}>{t("transactions.tableView")}</button>
            )}
            {hasFilters && (
              <button
                type="button"
                className="chip text-muted-foreground"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedCategory("all");
                  setSelectedType("all");
                  setSortBy("date-desc");
                  setCustomFrom("");
                  setCustomTo("");
                  setMinAmount("");
                  setMaxAmount("");
                }}
              >
                <FiX className="h-3.5 w-3.5" aria-hidden="true" />
                {t("transactions.filters.reset")}
              </button>
            )}
          </div>
          {showAdvancedFilters && (
            <div data-testid="advanced-filters-panel" className="surface grid grid-cols-2 gap-3 p-3.5 sm:grid-cols-4">
              <label className="col-span-2 flex min-w-0 flex-col gap-1 overflow-hidden text-xs font-semibold text-muted-foreground sm:col-span-1">
                {t("analytics.from")}
                <Input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className="block h-10 min-w-0 max-w-full appearance-none text-sm" />
              </label>
              <label className="col-span-2 flex min-w-0 flex-col gap-1 overflow-hidden text-xs font-semibold text-muted-foreground sm:col-span-1">
                {t("analytics.to")}
                <Input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} className="block h-10 min-w-0 max-w-full appearance-none text-sm" />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
                {t("transactions.filters.minAmount")}
                <Input
                  inputMode="decimal"
                  placeholder="0"
                  value={minAmount}
                  onChange={(event) => setMinAmount(event.target.value.replace(/[^0-9.,]/g, ""))}
                  className="h-10 text-sm tabular-nums"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
                {t("transactions.filters.maxAmount")}
                <Input
                  inputMode="decimal"
                  placeholder="—"
                  value={maxAmount}
                  onChange={(event) => setMaxAmount(event.target.value.replace(/[^0-9.,]/g, ""))}
                  className="h-10 text-sm tabular-nums"
                />
              </label>
            </div>
          )}
          {selectionMode && (
            <div
              data-testid="bulk-action-bar"
              className="surface flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-sm"
            >
              <div className="flex items-center gap-2">
                <span className="font-bold tabular-nums">
                  {t("transactions.bulk.selected", { count: selectedItems.length })}
                </span>
                {filteredTransactions.length > 0 && (
                  <Button type="button" size="sm" variant="ghost" onClick={toggleSelectAll} disabled={bulkBusy}>
                    {allVisibleSelected ? t("transactions.bulk.clearAll") : t("transactions.bulk.selectAll")}
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative shrink-0">
                  <select
                    aria-label={t("transactions.bulk.recategorize")}
                    defaultValue=""
                    disabled={!selectedItems.length || bulkBusy || hasMixedBulkTypes}
                    onChange={(event) => {
                      const value = event.target.value;
                      event.target.value = "";
                      handleBulkCategory(value);
                    }}
                    className="chip h-9 appearance-none pr-8 text-xs"
                  >
                    <option value="" disabled>{hasMixedBulkTypes ? t("transactions.bulk.mixedTypes") : t("transactions.bulk.recategorize")}</option>
                    {bulkCategories.map((cat) => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                  <FiChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={!selectedItems.length || bulkBusy}
                  onClick={() => setBulkDeleteConfirm(true)}
                >
                  <FiTrash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("transactions.actions.delete")}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={exitSelection} disabled={bulkBusy}>
                  {t("common.close")}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="surface grid grid-cols-3 divide-x divide-border py-3 text-center">
          <div className="flex flex-col justify-between gap-0.5 px-2">
            <p className="text-xs font-semibold text-muted-foreground">{t("transactions.summary.label")}</p>
            <p className="font-display text-base font-bold tabular-nums tracking-[-0.01em] sm:text-lg">{totals?.count ?? "—"}</p>
          </div>
          <div className="flex flex-col justify-between gap-0.5 px-2">
            <p className="text-xs font-semibold text-muted-foreground">{t("dashboard.income")}</p>
            <p className="amount truncate text-base text-income sm:text-lg">{totals ? formatSignedAmount(totals.income, "income") : "—"}</p>
          </div>
          <div className="flex flex-col justify-between gap-0.5 px-2">
            <p className="text-xs font-semibold text-muted-foreground">{t("dashboard.expenses")}</p>
            <p className="amount truncate text-base sm:text-lg">{totals ? formatSignedAmount(totals.expense, "expense") : "—"}</p>
          </div>
        </div>
        {!hasSearch && (isDemo || (totalTransactionCount > 0 && allLoadedTransactions.length < totalTransactionCount)) && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs font-medium text-muted-foreground">
            <p>
              {isDemo
                ? t("navbar.demoBadge", { count: demoCount, max: maxTransactions })
                : t("transactions.loadedOfTotal")}
              {!isDemo && <span className="ml-1 tabular-nums">{allLoadedTransactions.length} / {totalTransactionCount}</span>}
            </p>
            {!isDemo && hasMore && (
              <Button variant="outline" size="sm" onClick={handleLoadAll} disabled={isLoadingAll}>
                {isLoadingAll ? t("loading") : t("transactions.loadAll")}
              </Button>
            )}
          </div>
        )}

        <div className="space-y-5 pb-6">
          {hasSidebar && tableFits && preferTable && filteredTransactions.length > 0 ? (
            <div className="surface overflow-hidden">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">{t("transactions.title")}</caption>
                <thead className="bg-muted text-muted-foreground"><tr>
                  {["date", "description", "category", "amount"].map(key => (
                    <th key={key} scope="col" className={cn("px-3 py-2", key === "amount" && "text-right")}>{t(`transactionModal.${key}`)}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {filteredTransactions.map(item => {
                    const selected = selectionMode ? selectedIds.has(item.id) : selectedTransaction?.id === item.id;
                    return (
                      <tr key={item.id} className={cn("cursor-pointer hover:bg-muted/60", selected && "bg-accent")} onClick={() => handleSelect(item)}>
                        <td className="whitespace-nowrap px-3 py-2">{item.date.toLocaleDateString(i18n.language)}</td>
                        <td className="px-3 py-2"><button type="button" className="text-left font-semibold [overflow-wrap:anywhere]" aria-pressed={Boolean(selected)}>{item.description}</button>
                          {item.pendingSync && <span className="block text-xs text-warning-strong">{t("offline.pendingBadge")}</span>}
                        </td>
                        <td className="px-3 py-2">{getCategoryLabel(item.category)}</td>
                        <td className={cn("amount whitespace-nowrap px-3 py-2 text-right", item.type === "income" && "text-income")}>{formatSignedAmount(item.amount, item.type)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : filteredTransactions.length > 0 && isAmountSorted ? (
            <section aria-label={t("transactions.sort.label")} className="surface divide-y divide-border overflow-hidden px-2">
              {filteredTransactions.map((transaction) => (
                <SwipeableTransactionCard
                  key={transaction.id}
                  transaction={transaction}
                  meta={`${getCategoryLabel(transaction.category)} · ${formatRowDate(transaction.date, i18n.language, t)}`}
                  onSelect={handleSelect}
                  onDelete={handleDeleteClick}
                  selected={selectionMode ? selectedIds.has(transaction.id) : (showPanel && selectedTransaction.id === transaction.id)}
                />
              ))}
            </section>
          ) : groupedTransactions.length > 0 ? (
            groupedTransactions.map((group) => {
              const net = groupNetAmount(group.transactions);
              return (
                <section key={group.date.toISOString()} aria-label={group.displayDate} className="space-y-2">
                  <div className="flex items-baseline justify-between px-1 text-sm font-bold text-muted-foreground">
                    <h2 className="font-sans text-sm font-bold uppercase tracking-wide">{group.displayDate}</h2>
                    <span data-amount="true" className={cn("tabular-nums", net > 0 && "text-income")}>{formatSignedAmount(net, net >= 0 ? "income" : "expense")}</span>
                  </div>
                  <div className="surface divide-y divide-border overflow-hidden px-2">
                    {group.transactions.map((transaction) => (
                      <SwipeableTransactionCard
                        key={transaction.id}
                        transaction={transaction}
                        meta={isSearching
                          ? `${getCategoryLabel(transaction.category)} · ${formatRowDate(transaction.date, i18n.language, t)}`
                          : getCategoryLabel(transaction.category)}
                        onSelect={handleSelect}
                        onDelete={handleDeleteClick}
                        selected={selectionMode ? selectedIds.has(transaction.id) : (showPanel && selectedTransaction.id === transaction.id)}
                      />
                    ))}
                  </div>
                </section>
              );
            })
          ) : !resultsReady ? (
            !loadError && <p role="status" className="py-6 text-center text-sm text-muted-foreground">{t("loading")}</p>
          ) : (
            <div className="surface px-6 py-12 text-center">
              <h2 className="text-lg font-bold">{t("transactions.empty.title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasFilters ? t("transactions.empty.tryFilters") : t("transactions.empty.addFirst")}
              </p>
            </div>
          )}

          {!hasSearch && hasMore && !isDemo && allLoadedTransactions.length > 0 && (
            <div ref={sentinelRef} className="flex justify-center py-6">
              {isLoadingMore && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  {t("loading")}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showPanel && (
        <aside
          aria-label={t("transactionModal.editTitle")}
          className="surface sticky top-8 flex max-h-[calc(100vh-4rem)] w-[380px] shrink-0 flex-col self-start overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2 px-5 pb-2 pt-5">
            <h2 className="text-lg font-bold">{t("transactionModal.editTitle")}</h2>
            <button
              type="button"
              onClick={() => setSelectedTransaction(null)}
              aria-label={t("common.close")}
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <FiX className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="flex gap-2 px-5 pb-3">
            <Button variant="outline" size="sm" onClick={() => duplicate(selectedTransaction)}>
              <FiCopy aria-hidden="true" /> {t("transactions.actions.duplicate")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(selectedTransaction.id)}>
              <FiTrash2 aria-hidden="true" /> {t("transactions.actions.delete")}
            </Button>
          </div>
          <TransactionForm
            key={selectedTransaction.id}
            transaction={selectedTransaction}
            idPrefix="panel-transaction"
            onSubmit={(payload) => saveEdit(selectedTransaction, payload)}
          />
        </aside>
      )}

      <TransactionModal
        show={!!editTransaction}
        onClose={() => setEditTransaction(null)}
        onSubmit={handleModalSubmit}
        transaction={editTransaction}
      />

      <TransactionActionsDialog
        transaction={actionTransaction}
        onClose={() => setActionTransaction(null)}
        onEdit={(transaction) => {
          setEditTransaction(transaction);
          setActionTransaction(null);
        }}
        onDuplicate={handleDuplicate}
        onDelete={(transactionId) => {
          setDeleteConfirm(transactionId);
          setActionTransaction(null);
        }}
      />

      <DeleteTransactionDialog
        open={!!deleteConfirm}
        transaction={transactionToDelete}
        formatDate={formatGroupDate}
        getCategoryLabel={getCategoryLabel}
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={confirmDelete}
      />

      <Dialog open={bulkDeleteConfirm} onOpenChange={(open) => !open && setBulkDeleteConfirm(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="pr-10">{t("transactions.bulk.deleteTitle", { count: selectedItems.length })}</DialogTitle>
            <DialogDescription>{t("transactions.deleteDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-2 sm:justify-end">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setBulkDeleteConfirm(false)}>{t("cancel")}</Button>
            <Button variant="destructive" className="flex-1 sm:flex-none" onClick={confirmBulkDelete}>{t("transactions.deleteConfirm")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </PullToRefresh>
  );
};

export default TransactionList;
