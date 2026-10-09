import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useMediaQuery } from "react-responsive";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";
import { useAuth } from "../../context/AuthProvider.jsx";
import TransactionModal from "./TransactionModal.jsx";
import TransactionForm from "./TransactionForm.jsx";
import SwipeableTransactionCard from "./SwipeableTransactionCard.jsx";
import TransactionActionsDialog from "./TransactionActionsDialog.jsx";
import DeleteTransactionDialog from "./DeleteTransactionDialog.jsx";
import { compareTransactions } from "../../utils/transactionOrder.js";
import { formatGroupDate as formatGroupDateLabel, groupNetAmount, groupTransactionsByDate } from "../../utils/transactionGrouping.js";
import { FiChevronDown, FiCopy, FiSearch, FiTrash2, FiX } from "react-icons/fi";
import { useCategories } from "../../utils/categories.jsx";
import { useTranslation } from "react-i18next";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { Button } from "../ui/button";
import MonthSwitcher from "../ui/MonthSwitcher.jsx";
import { useMonthRange } from "../../hooks/useMonthRange.js";
import { useTransactionFilter } from "../../hooks/useTransactionFilter.jsx";
import { getPeriodRange } from "../../utils/statsUtils.jsx";
import { formatSignedAmount } from "../../utils/formatCurrency.jsx";
import { cn } from "../../lib/utils";

const TYPE_FILTERS = ["all", "expense", "income"];

const TransactionList = () => {
  const { t, i18n } = useTranslation();
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
    recentRevision,
  } = useUnifiedTransactions();

  const { expenseCategories, incomeCategories } = useCategories();
  const isDesktop = useMediaQuery({ minWidth: 1024 });

  const [editTransaction, setEditTransaction] = useState(null);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [actionTransaction, setActionTransaction] = useState(null);

  const [allLoadedTransactions, setAllLoadedTransactions] = useState([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [pageCursor, setPageCursor] = useState(null);
  const [totalTransactionCount, setTotalTransactionCount] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const pageRevisionRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const hasLoadedPageRef = useRef(false);

  const monthRange = useMonthRange();
  const [allTime, setAllTime] = useState(false);
  const { startDate, endDate } = useMemo(() => {
    if (!allTime) return { startDate: monthRange.startDate, endDate: monthRange.endDate };
    const range = getPeriodRange("all");
    return { startDate: range.start, endDate: range.end };
  }, [allTime, monthRange.startDate, monthRange.endDate]);

  const {
    filteredTransactions,
    searchTerm,
    setSearchTerm,
    selectedCategory,
    setSelectedCategory,
    selectedType,
    setSelectedType,
  } = useTransactionFilter(
    isDemo || (!hasLoadedPageRef.current && allLoadedTransactions.length === 0) ? transactions : allLoadedTransactions,
    { startDate, endDate }
  );

  useEffect(() => {
    let cancelled = false;
    const fetchCount = async () => {
      try {
        if (currentUser && !isDemo) {
          const count = await getTotalTransactionCount({ startDate, endDate, type: selectedType });
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
  }, [currentUser, isDemo, getTotalTransactionCount, transactions, startDate, endDate, selectedType, recentRevision, reloadKey, t]);

  // Reset to the first deterministic date-ordered page whenever the realtime
  // stream changes. This prevents stale cross-device deletions from surviving
  // in an independently merged history.
  useEffect(() => {
    let cancelled = false;
    pageRevisionRef.current += 1;
    loadingMoreRef.current = false;
    setIsLoadingMore(false);
    setHasMore(false);
    setPageCursor(null);
    const loadFirstPage = async () => {
      if (isDemo) {
        setAllLoadedTransactions(transactions);
        hasLoadedPageRef.current = true;
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
        const page = await fetchTransactionPage({ pageSize: 40, startDate, endDate, type: selectedType });
        if (cancelled) return;
        setAllLoadedTransactions(page.items);
        hasLoadedPageRef.current = true;
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
  }, [currentUser, fetchTransactionPage, isDemo, recentRevision, reloadKey, transactions, startDate, endDate, selectedType, t]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMoreRef.current || isLoadingInitial || !hasMore) return;
    const revision = pageRevisionRef.current;
    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    setLoadError("");
    try {
      const page = await fetchTransactionPage({ pageSize: 40, cursor: pageCursor, startDate, endDate, type: selectedType });
      if (revision !== pageRevisionRef.current) return;
      setAllLoadedTransactions((previous) => {
        const merged = new Map(previous.map((item) => [item.id, item]));
        page.items.forEach((item) => merged.set(item.id, item));
        return Array.from(merged.values()).sort(compareTransactions);
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
  }, [fetchTransactionPage, hasMore, isLoadingInitial, pageCursor, startDate, endDate, selectedType, t]);

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
  }, [hasMore, isLoadingMore, isDemo, allLoadedTransactions.length, handleLoadMore]);

  // Keep the side panel in sync with the list (edits, deletions, period changes).
  useEffect(() => {
    if (!selectedTransaction) return;
    const fresh = allLoadedTransactions.find((item) => item.id === selectedTransaction.id);
    if (!fresh) setSelectedTransaction(null);
    else if (fresh !== selectedTransaction) setSelectedTransaction(fresh);
  }, [allLoadedTransactions, selectedTransaction]);

  const loading = authLoading || (isLoadingInitial && allLoadedTransactions.length === 0 && transactions.length === 0);

  const formatGroupDate = (date) => formatGroupDateLabel(date, i18n.language, t);

  const getCategoryLabel = useCallback((category) => {
    const categoryData = [...expenseCategories, ...incomeCategories].find((c) => c.value === category);
    if (categoryData) return categoryData.label;
    return t(`categories.${category}`, { defaultValue: category });
  }, [expenseCategories, incomeCategories, t]);

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

  const confirmDelete = useCallback(async () => {
    if (deleteConfirm) {
      const success = await deleteTransaction(deleteConfirm);
      if (success) {
        setDeleteConfirm(null);
        setAllLoadedTransactions((prev) => prev.filter((item) => item.id !== deleteConfirm));
        setSelectedTransaction((current) => (current?.id === deleteConfirm ? null : current));
      }
    }
  }, [deleteConfirm, deleteTransaction]);

  const transactionToDelete = deleteConfirm
    ? allLoadedTransactions.find((item) => item.id === deleteConfirm) || transactions.find((item) => item.id === deleteConfirm)
    : null;

  const categories = useMemo(() => {
    const source = allLoadedTransactions.length > 0 ? allLoadedTransactions : transactions;
    return [...new Set(source.map((item) => item.category))].sort((first, second) =>
      getCategoryLabel(first).localeCompare(getCategoryLabel(second)));
  }, [allLoadedTransactions, transactions, getCategoryLabel]);

  const saveEdit = useCallback(async (target, payload) => {
    const success = await updateTransaction(target.id, payload);
    if (success) {
      setAllLoadedTransactions((prev) => prev.map((item) => (item.id === target.id ? { ...item, ...payload } : item)));
    }
    return success;
  }, [updateTransaction]);

  const handleModalSubmit = useCallback(async (payload) => {
    if (editTransaction) return saveEdit(editTransaction, payload);
    return addTransaction(payload);
  }, [addTransaction, editTransaction, saveEdit]);

  const handleSelect = useCallback((transaction) => {
    if (isDesktop) setSelectedTransaction(transaction);
    else setActionTransaction(transaction);
  }, [isDesktop]);

  const totals = useMemo(() => filteredTransactions.reduce(
    (sum, item) => {
      if (item.type === "income") sum.income += item.amount;
      else sum.expense += item.amount;
      return sum;
    },
    { income: 0, expense: 0 }
  ), [filteredTransactions]);

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

  const groupedTransactions = groupTransactionsByDate(filteredTransactions, formatGroupDate);
  const hasFilters = searchTerm || selectedCategory !== "all" || selectedType !== "all";
  const showPanel = isDesktop && selectedTransaction;
  const demoCount = transactions.filter((item) => !item.isSample).length;

  return (
    <div className={cn("mx-auto flex w-full gap-6", showPanel ? "max-w-[1400px]" : "max-w-6xl")}>
      <div className="min-w-0 flex-1 space-y-4">
        {loadError && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <span>{loadError}</span>
            <Button variant="outline" size="sm" onClick={() => setReloadKey((value) => value + 1)}>{t("common.retry")}</Button>
          </div>
        )}

        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h1 className="pl-1 text-[1.75rem] font-extrabold leading-tight md:pl-0 md:text-3xl">{t("transactions.title")}</h1>
          <MonthSwitcher
            size="sm"
            month={monthRange.month}
            onPrevious={monthRange.goToPrevious}
            onNext={monthRange.goToNext}
            canGoNext={!monthRange.isCurrentMonth}
            disabled={allTime}
            className="rounded-full border border-border bg-card px-0.5"
          />
        </header>

        <div className="space-y-3">
          <label className="relative block">
            <span className="sr-only">{t("searchTransactions")}</span>
            <FiSearch className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              className="h-12 w-full rounded-2xl border border-input bg-card pl-11 pr-4 text-base outline-none transition placeholder:text-muted-foreground/80 focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
              placeholder={t("searchTransactions")}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              aria-describedby={searchTerm && hasMore ? "search-scope-help" : undefined}
            />
          </label>
          {searchTerm && hasMore && (
            <p id="search-scope-help" className="px-1 text-xs text-muted-foreground">
              {t("transactions.searchScope", { count: allLoadedTransactions.length })}
            </p>
          )}

          <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 scrollbar-none md:mx-0 md:flex-wrap md:px-0" data-swipe-ignore="true">
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
            <button type="button" className="chip" aria-pressed={allTime} onClick={() => setAllTime((value) => !value)}>
              {t("transactions.filters.allTime")}
            </button>
          </div>
        </div>

        <div className="surface grid grid-cols-3 divide-x divide-border py-3 text-center">
          <div className="px-2">
            <p className="text-xs font-semibold text-muted-foreground">{t("transactions.summary.label")}</p>
            <p className="amount text-base sm:text-lg">{filteredTransactions.length}</p>
          </div>
          <div className="px-2">
            <p className="text-xs font-semibold text-muted-foreground">{t("dashboard.income")}</p>
            <p className="amount truncate text-base text-income sm:text-lg">{formatSignedAmount(totals.income, "income")}</p>
          </div>
          <div className="px-2">
            <p className="text-xs font-semibold text-muted-foreground">{t("dashboard.expenses")}</p>
            <p className="amount truncate text-base sm:text-lg">{formatSignedAmount(totals.expense, "expense")}</p>
          </div>
        </div>
        {(isDemo || (totalTransactionCount > 0 && allLoadedTransactions.length < totalTransactionCount)) && (
          <p className="px-1 text-xs font-medium text-muted-foreground">
            {isDemo
              ? t("navbar.demoBadge", { count: demoCount, max: maxTransactions })
              : t("transactions.loadedOfTotal")}
            {!isDemo && <span className="ml-1 tabular-nums">{allLoadedTransactions.length} / {totalTransactionCount}</span>}
          </p>
        )}

        <div className="space-y-5 pb-6">
          {groupedTransactions.length > 0 ? (
            groupedTransactions.map((group) => {
              const net = groupNetAmount(group.transactions);
              return (
                <section key={group.date.toISOString()} aria-label={group.displayDate} className="space-y-2">
                  <div className="flex items-baseline justify-between px-1 text-[13px] font-bold text-muted-foreground">
                    <h2 className="font-sans text-[13px] font-bold uppercase tracking-wide">{group.displayDate}</h2>
                    <span className={cn("tabular-nums", net > 0 && "text-income")}>{formatSignedAmount(net, net >= 0 ? "income" : "expense")}</span>
                  </div>
                  <div className="surface divide-y divide-border overflow-hidden px-2">
                    {group.transactions.map((transaction) => (
                      <SwipeableTransactionCard
                        key={transaction.id}
                        transaction={transaction}
                        meta={getCategoryLabel(transaction.category)}
                        onSelect={handleSelect}
                        onDelete={handleDeleteClick}
                        selected={showPanel && selectedTransaction.id === transaction.id}
                      />
                    ))}
                  </div>
                </section>
              );
            })
          ) : (
            <div className="surface px-6 py-12 text-center">
              <h2 className="text-lg font-bold">{t("transactions.empty.title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasFilters ? t("transactions.empty.tryFilters") : t("transactions.empty.addFirst")}
              </p>
            </div>
          )}

          {hasMore && !isDemo && allLoadedTransactions.length > 0 && (
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
    </div>
  );
};

export default React.memo(TransactionList);
