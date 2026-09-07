import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";
import { useAuth } from "../../context/AuthProvider.jsx";
import TransactionModal from "./TransactionModal.jsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useDrag } from "@use-gesture/react";
import { format, isToday, isYesterday } from "date-fns";
import { it, enUS } from "date-fns/locale";
import formatCurrency from "../../utils/formatCurrency.jsx";
import { FiTrash2, FiFilter, FiSearch, FiMoreVertical, FiCopy, FiEdit2 } from "react-icons/fi";
import { useCategories } from "../../utils/categories.jsx";
import { useTranslation } from "react-i18next";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Badge } from "../ui/badge";
import { useDateRange } from "../../hooks/useDateRange.jsx";
import { useTransactionFilter } from "../../hooks/useTransactionFilter.jsx";
import PropTypes from "prop-types";

const SWIPE_DELETE_THRESHOLD = 80;
const SWIPE_VELOCITY_THRESHOLD = 0.5;
const SNAP_ANIMATION = { type: "spring", stiffness: 500, damping: 40 };

const SwipeableTransactionCard = ({ transaction, onActions, onDelete, language, getCategoryLabel }) => {
  const x = useMotionValue(0);
  const deleteOpacity = useTransform(x, [-SWIPE_DELETE_THRESHOLD, -20], [1, 0]);

  const bind = useDrag(
    ({ down, movement: [mx], velocity: [vx], direction: [dx] }) => {
      if (down) {
        x.set(Math.min(0, mx));
      } else {
        if (mx < -SWIPE_DELETE_THRESHOLD || (vx > SWIPE_VELOCITY_THRESHOLD && dx < 0)) {
          onDelete(transaction.id);
        }
        animate(x, 0, SNAP_ANIMATION);
      }
    },
    { axis: "x", filterTaps: true }
  );

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <motion.div
        style={{ opacity: deleteOpacity }}
        className="absolute inset-y-0 right-0 flex items-center bg-destructive px-5 rounded-r-2xl"
        aria-hidden="true"
      >
        <FiTrash2 className="h-5 w-5 text-white" />
      </motion.div>
      <motion.div
        style={{ x }}
        {...bind()}
        className="relative z-10 flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-card/80 p-3 shadow-sm touch-pan-y sm:p-4"
      >
        <div className="min-w-0 flex-1 space-y-1">
            <div className="truncate text-sm font-semibold leading-tight sm:text-base">{transaction.description}</div>
            <div className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
              <span>
                {format(transaction.date, language === "it" ? "dd MMM yyyy" : "MMM dd, yyyy", {
                  locale: language === "it" ? it : enUS,
                })}
              </span>
              <span>•</span>
              <span className="truncate">{getCategoryLabel(transaction.category)}</span>
            </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <div
            className={`text-right text-sm font-bold sm:text-base ${
              transaction.type === "income" ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {transaction.type === "income" ? "+" : "-"}
            {formatCurrency(transaction.amount)}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-9 w-9 shrink-0 p-0"
            aria-label="Transaction actions"
            onClick={(e) => {
              e.stopPropagation();
              onActions(transaction);
            }}
          >
            <FiMoreVertical className="h-5 w-5" />
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

SwipeableTransactionCard.propTypes = {
  transaction: PropTypes.shape({
    id: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired,
    date: PropTypes.instanceOf(Date).isRequired,
    category: PropTypes.string.isRequired,
    type: PropTypes.oneOf(["income", "expense"]).isRequired,
    amount: PropTypes.number.isRequired,
  }).isRequired,
  onActions: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  language: PropTypes.string.isRequired,
  getCategoryLabel: PropTypes.func.isRequired,
};

const TransactionList = () => {
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

  const [editTransaction, setEditTransaction] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [actionTransaction, setActionTransaction] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  
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

  // Using custom hooks
  const { period, setPeriod, startDate, endDate } = useDateRange("monthly");
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
        if (!cancelled) setLoadError("Impossibile caricare il conteggio delle transazioni.");
      }
    };
    fetchCount();
    return () => { cancelled = true; };
  }, [currentUser, isDemo, getTotalTransactionCount, transactions, startDate, endDate, selectedType, recentRevision, reloadKey]);

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
          ? "Verifica l'email per accedere alle transazioni."
          : "Impossibile caricare le transazioni. Riprova.");
      } finally {
        if (!cancelled) setIsLoadingInitial(false);
      }
    };
    loadFirstPage();
    return () => { cancelled = true; pageRevisionRef.current += 1; };
  }, [currentUser, fetchTransactionPage, isDemo, recentRevision, reloadKey, transactions, startDate, endDate, selectedType]);

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
        return Array.from(merged.values()).sort((a, b) => b.date - a.date || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
      });
      setPageCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch {
      if (revision === pageRevisionRef.current) setLoadError("Impossibile caricare altre transazioni. Riprova.");
    } finally {
      if (revision === pageRevisionRef.current) {
        loadingMoreRef.current = false;
        setIsLoadingMore(false);
      }
    }
  }, [fetchTransactionPage, hasMore, isLoadingInitial, pageCursor, startDate, endDate, selectedType]);

  const sentinelRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !isDemo && allLoadedTransactions.length > 0) {
          handleLoadMore();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );
    
    const currentRef = sentinelRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }
    
    return () => {
      if (currentRef) observer.unobserve(currentRef);
    };
  }, [hasMore, isLoadingMore, isDemo, allLoadedTransactions.length, handleLoadMore]);

  const { t, i18n } = useTranslation();

  const loading = authLoading || (isLoadingInitial && allLoadedTransactions.length === 0 && transactions.length === 0);
  const hasActiveFilters = selectedCategory !== "all" || selectedType !== "all";

  const motivationalQuotes = useMemo(() => t("dashboard.motivationalQuotes", { returnObjects: true }), [t]);
  const [quote, setQuote] = useState("");
  useEffect(() => {
    if (motivationalQuotes && motivationalQuotes.length > 0) {
      setQuote(motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)]);
    }
  }, [motivationalQuotes]);

  const getDateLocale = (lang) => {
    return lang === "it" ? it : enUS;
  };

  const formatGroupDate = (date) => {
    const lang = i18n.language || "it";
    if (isToday(date)) return t("transactions.today");
    if (isYesterday(date)) return t("transactions.yesterday");
    
    const locale = getDateLocale(lang);
    // Use a format that works well for both languages, or keep the conditional
    // 'd MMMM yyyy' is standard for Italian, 'MMM d, yyyy' for English
    const pattern = lang === "it" ? "d MMMM yyyy" : "MMMM d, yyyy";
    return format(date, pattern, { locale });
  };

  const groupTransactionsByDate = (transactions) => {
    const groups = {};
    transactions.forEach((transaction) => {
      const date = transaction.date;
      const dateKey = format(date, "yyyy-MM-dd");
      if (!groups[dateKey]) {
        groups[dateKey] = {
          date,
          displayDate: formatGroupDate(date),
          transactions: [],
        };
      }
      groups[dateKey].transactions.push(transaction);
    });
    return Object.values(groups).sort((a, b) => b.date - a.date);
  };

  const getCategoryLabel = (category) => {
    const allCategories = [...expenseCategories, ...incomeCategories];
    const categoryData = allCategories.find((c) => c.value === category);
    if (categoryData) return categoryData.label;
    return t(`categories.${category}`, { defaultValue: category });
  };

  const handleDeleteClick = useCallback(async (transactionId) => {
    setDeleteConfirm(transactionId);
  }, []);

  const handleDuplicate = useCallback(async () => {
    if (!actionTransaction) return;

    const success = await addTransaction({
      type: actionTransaction.type,
      amount: actionTransaction.amount,
      description: actionTransaction.description,
      date: actionTransaction.date,
      category: actionTransaction.category,
    });
    if (success) setActionTransaction(null);
  }, [actionTransaction, addTransaction]);

  const confirmDelete = useCallback(async () => {
    if (deleteConfirm) {
      const success = await deleteTransaction(deleteConfirm);
      if (success) {
        setDeleteConfirm(null);
        setAllLoadedTransactions(prev => prev.filter(t => t.id !== deleteConfirm));
      }
    }
  }, [deleteConfirm, deleteTransaction]);

  const categories = [...new Set(allLoadedTransactions.length > 0 ? allLoadedTransactions.map(t => t.category) : transactions.map(t => t.category))];

  const periodOptions = [
    { value: "daily", label: t("transactions.filters.today") },
    { value: "weekly", label: t("transactions.filters.week") },
    { value: "monthly", label: t("transactions.filters.month") },
    { value: "annually", label: t("transactions.filters.year") },
    { value: "all", label: t("transactions.filters.all") },
  ];

  const handleModalSubmit = useCallback(async (payload) => {
    if (editTransaction) {
      const success = await updateTransaction(editTransaction.id, payload);
      if (success) {
        setAllLoadedTransactions((prev) =>
          prev.map((t) => (t.id === editTransaction.id ? { ...t, ...payload } : t))
        );
      }
      return success;
    }

    return addTransaction(payload);
  }, [addTransaction, updateTransaction, editTransaction]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton height={120} borderRadius={16} />
          <Skeleton height={120} borderRadius={16} />
        </div>
        {[...Array(4)].map((_, idx) => (
          <div key={idx} className="space-y-3">
            <Skeleton width={140} height={20} />
            <Skeleton height={72} borderRadius={18} />
          </div>
        ))}
      </div>
    );
  }

  if (!currentUser && !isDemo) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-3">
          <h2 className="text-2xl font-semibold">{t("transactions.accessRequired")}</h2>
          <p className="text-muted-foreground">{t("transactions.loginRequired")}</p>
        </div>
      </div>
    );
  }

  const groupedTransactions = groupTransactionsByDate(filteredTransactions);

  return (
    <div className="page-shell -mt-6 pt-0">
      {loadError && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <span>{loadError}</span>
          <Button variant="outline" size="sm" onClick={() => setReloadKey((value) => value + 1)}>Riprova</Button>
        </div>
      )}
      <div className="sticky top-0 z-20 rounded-2xl border border-border bg-card/90 backdrop-blur-md p-3 md:p-4 shadow-md">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
              💳 {t("transactions.title")}
            </h1>
            <div className="hidden text-primary text-sm italic md:block">{quote}</div>
            {!isDemo && totalTransactionCount > 0 && (
              <div className="text-xs text-muted-foreground">{allLoadedTransactions.length} / {totalTransactionCount}</div>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-10"
              placeholder={t("searchTransactions")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-describedby={searchTerm && hasMore ? "search-scope-help" : undefined}
            />
            {searchTerm && hasMore && (
              <p id="search-scope-help" className="mt-1 text-xs text-muted-foreground">
                La ricerca considera le {allLoadedTransactions.length} transazioni già caricate. Scorri per estenderla.
              </p>
            )}
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="min-w-0">
              {periodOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Button
              variant={showFilters ? "default" : "outline"}
              size="icon"
              onClick={() => setShowFilters(!showFilters)}
              className="relative shrink-0 sm:w-auto sm:px-3"
              aria-label={showFilters ? t("transactions.filters.hide") : t("transactions.filters.show")}
            >
              <FiFilter />
              <span className="hidden sm:inline">
                {showFilters ? t("transactions.filters.hide") : t("transactions.filters.show")}
              </span>
              {hasActiveFilters && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary-foreground sm:right-2" aria-hidden="true" />
              )}
            </Button>
          </div>

          {isDemo && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary flex items-center gap-2">
              <Badge variant="secondary">{transactions.filter(t => !t.isSample).length}/{maxTransactions}</Badge>
              <span>{t("transactions.demoMode")}</span>
            </div>
          )}

          {showFilters && (
              <div className="grid gap-3 md:grid-cols-2">
                <Select value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
                  <option value="all">{t("transactions.filters.allTypes")}</option>
                  <option value="income">{t("income")}</option>
                  <option value="expense">{t("expense")}</option>
                </Select>
                <Select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                  <option value="all">Categorie</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category.charAt(0).toUpperCase() + category.slice(1)}
                    </option>
                  ))}
                </Select>
              </div>
            )}
        </div>
      </div>

      <div className="space-y-4 pb-6 pt-3">
        {groupedTransactions.length > 0 ? (
          groupedTransactions.map((group) => (
            <div
              key={group.date.toISOString()}
              className="space-y-2"
            >
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                  {group.displayDate}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-2">
                {group.transactions.map((transaction) => (
                  <div key={transaction.id}>
                    <SwipeableTransactionCard
                      transaction={transaction}
                      onActions={setActionTransaction}
                      onDelete={handleDeleteClick}
                      language={i18n.language}
                      getCategoryLabel={getCategoryLabel}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-10">
            <h3 className="text-xl font-semibold text-foreground">{t("transactions.empty.title")}</h3>
            <p className="text-muted-foreground">
              {searchTerm || selectedCategory !== "all" || selectedType !== "all"
                ? t("transactions.empty.tryFilters")
                : t("transactions.empty.addFirst")}
            </p>
          </div>
        )}
        
        {/* Infinite Scroll Sentinel */}
        {hasMore && !isDemo && allLoadedTransactions.length > 0 && (
          <div ref={sentinelRef} className="flex justify-center py-6">
            {isLoadingMore && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                {t("loading")}
              </div>
            )}
          </div>
        )}
      </div>

      <TransactionModal
        show={!!editTransaction}
        onClose={() => {
          setEditTransaction(null);
        }}
        onSubmit={handleModalSubmit}
        transaction={editTransaction}
      />

      <Dialog open={!!actionTransaction} onOpenChange={(open) => !open && setActionTransaction(null)}>
        <DialogContent className="max-w-sm p-5">
          <DialogHeader>
            <DialogTitle>{actionTransaction?.description}</DialogTitle>
            <DialogDescription>{t("transactions.actions.description")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 pt-2">
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => {
                setEditTransaction(actionTransaction);
                setActionTransaction(null);
              }}
            >
              <FiEdit2 />
              {t("transactions.actions.edit")}
            </Button>
            <Button variant="outline" className="justify-start" onClick={handleDuplicate}>
              <FiCopy />
              {t("transactions.actions.duplicate")}
            </Button>
            <Button
              variant="destructive"
              className="justify-start"
              onClick={() => {
                setDeleteConfirm(actionTransaction.id);
                setActionTransaction(null);
              }}
            >
              <FiTrash2 />
              {t("transactions.actions.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmDelete")}</DialogTitle>
            <DialogDescription>
              {t("transactions.deleteConfirm")}
            </DialogDescription>
          </DialogHeader>
          
          {(() => {
             const transactionToDelete = allLoadedTransactions.find(t => t.id === deleteConfirm) || transactions.find((t) => t.id === deleteConfirm);
             if (!transactionToDelete) return null;
             return (
               <div className="py-4 space-y-1">
                  <div className="font-bold text-foreground">
                    {transactionToDelete.description}
                  </div>
                  <div className="text-muted-foreground text-sm">
                    {formatGroupDate(transactionToDelete.date)} •{" "}
                    {getCategoryLabel(transactionToDelete.category)}
                  </div>
                  <div
                    className={`font-semibold ${
                      transactionToDelete.type === "income"
                        ? "text-emerald-600"
                        : "text-rose-600"
                    }`}
                  >
                    {transactionToDelete.type === "income" ? "+" : "-"}
                    {formatCurrency(transactionToDelete.amount)}
                  </div>
               </div>
             );
          })()}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              {t("transactions.deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default React.memo(TransactionList);
