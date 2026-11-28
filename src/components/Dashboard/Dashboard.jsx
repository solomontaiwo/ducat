import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { FiChevronRight, FiEye, FiEyeOff } from "react-icons/fi";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { useAuth } from "../../context/AuthProvider.jsx";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";
import { useAddTransaction } from "../../context/AddTransactionContext.jsx";
import { Link } from "../../router/RouterProvider";
import RecentTransactions from "./RecentTransactions";
import QuickAddForm from "./QuickAddForm.jsx";
import TransactionModal from "../Transaction/TransactionModal.jsx";
import DeleteTransactionDialog from "../Transaction/DeleteTransactionDialog.jsx";
import MonthSwitcher from "../ui/MonthSwitcher.jsx";
import formatCurrency, { formatSignedAmount } from "../../utils/formatCurrency.jsx";
import { calculateStats } from "../../utils/statsUtils.jsx";
import { formatCycleRange, formatMonthLabel } from "../../utils/monthLabel";
import { useMonthRange } from "../../hooks/useMonthRange.js";
import UpcomingCard from "../Planning/UpcomingCard.jsx";
import BudgetCard from "../Planning/BudgetCard.jsx";
import { usePlanning } from "../../context/PlanningProvider.jsx";
import { usePrivacy } from "../../context/PrivacyProvider.jsx";
import { hapticTap } from "../../platform/haptics.js";
import HeaderProfileButton from "../Layout/HeaderProfileButton.jsx";
import PullToRefresh from "../ui/PullToRefresh.jsx";
import { todayDateKey } from "../../utils/dateUtils.js";
import { upcomingOccurrences } from "../../utils/recurrence.js";
import { computeMonthProjection } from "../../utils/projection.js";
import { formatGroupDate } from "../../utils/transactionGrouping.js";

const CATEGORY_COLORS = ["hsl(var(--cat-1))", "hsl(var(--cat-2))", "hsl(var(--cat-3))", "hsl(var(--cat-4))", "hsl(var(--cat-5))"];
const MAX_VISIBLE_CATEGORIES = 4;
const EMPTY_TRANSACTIONS = [];

const getGreetingKey = (hour) => {
  if (hour < 12) return "greetingMorning";
  if (hour < 18) return "greetingAfternoon";
  return "greetingEvening";
};

// Months already seen in this session, shown at once when the user comes back
// to them and refreshed in the background.
const monthCache = new Map();
const MONTH_CACHE_LIMIT = 12;
const rememberMonth = (key, data) => {
  monthCache.delete(key);
  monthCache.set(key, data);
  if (monthCache.size > MONTH_CACHE_LIMIT) monthCache.delete(monthCache.keys().next().value);
};

const Dashboard = () => {
  const { currentUser, profileName, profileNameLoading } = useAuth();
  const { transactions, isDemo, loading: transactionsLoading, fetchAllTransactions, syncOfflineQueue, deleteTransaction } = useUnifiedTransactions();
  const { openAddTransaction, canAdd } = useAddTransaction();
  const { recurring, budgets, preferences } = usePlanning();
  const { hideAmounts, toggleHideAmounts } = usePrivacy();
  const { t, i18n } = useTranslation();
  const { month, startDate, endDate, startDay, isCurrentMonth, canGoNext, goToPrevious, goToNext } = useMonthRange();
  const [monthResult, setMonthResult] = useState({ key: null, data: EMPTY_TRANSACTIONS });
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const requestIdRef = useRef(0);
  const [localHour, setLocalHour] = useState(() => new Date().getHours());
  const [todayKey, setTodayKey] = useState(todayDateKey);
  const monthKey = JSON.stringify([isDemo ? "demo" : currentUser?.uid ?? null, startDate, endDate]);
  const monthData = monthResult.key === monthKey ? monthResult.data : EMPTY_TRANSACTIONS;

  useEffect(() => {
    const load = async () => {
      const requestId = ++requestIdRef.current;
      if (isDemo) {
        setMonthResult({ key: monthKey, data: transactions });
        setLoadError("");
      } else if (currentUser) {
        setLoadError("");
        const cached = monthCache.get(monthKey);
        if (cached) setMonthResult((previous) => (previous.key === monthKey ? previous : { key: monthKey, data: cached }));
        try {
          const data = await fetchAllTransactions({ startDate, endDate });
          rememberMonth(monthKey, data);
          if (requestId === requestIdRef.current) setMonthResult({ key: monthKey, data });
        } catch (error) {
          if (requestId === requestIdRef.current) {
            setLoadError(error.code === "permission-denied" ? t("security.emailVerificationRequired") : t("error"));
            setMonthResult((previous) => previous.key === monthKey ? previous : { key: monthKey, data: EMPTY_TRANSACTIONS });
          }
        }
      } else {
        setMonthResult({ key: monthKey, data: EMPTY_TRANSACTIONS });
        setLoadError("");
      }
    };
    load();
    return () => { requestIdRef.current += 1; };
  }, [isDemo, transactions, currentUser, fetchAllTransactions, startDate, endDate, monthKey, t]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setLocalHour(new Date().getHours());
      setTodayKey(todayDateKey());
    }, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const stats = useMemo(() => {
    if (transactionsLoading) return null;
    const actual = isCurrentMonth ? monthData.filter((item) => item.date && (item.dateKey || format(item.date, "yyyy-MM-dd")) <= todayKey) : monthData;
    return calculateStats(actual, startDate, endDate);
  }, [monthData, startDate, endDate, transactionsLoading, isCurrentMonth, todayKey]);

  const monthTransactions = useMemo(
    () => monthData.filter((item) => item.date && item.date >= startDate && item.date <= endDate),
    [monthData, startDate, endDate]
  );

  const projection = useMemo(
    () => (isCurrentMonth && stats
      ? computeMonthProjection({ stats, monthTransactions, recurring, startDate, endDate })
      : null),
    [isCurrentMonth, stats, monthTransactions, recurring, startDate, endDate]
  );

  const spendingCategories = useMemo(() => {
    const entries = Object.entries(stats?.categoryBreakdown || {}).sort(([, first], [, second]) => second - first);
    const visible = entries.slice(0, MAX_VISIBLE_CATEGORIES).map(([category, amount]) => ({
      category,
      label: t(`categories.${category}`, { defaultValue: category }),
      amount,
    }));
    const remaining = entries.slice(MAX_VISIBLE_CATEGORIES).reduce((sum, [, amount]) => sum + amount, 0);
    if (remaining > 0) visible.push({ category: "remaining", label: t("dashboard.remainingCategories"), amount: remaining });
    return visible.map((item, index) => ({
      ...item,
      color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
      percentage: stats?.totalExpense ? (item.amount / stats.totalExpense) * 100 : 0,
    }));
  }, [stats, t]);

  const isLoading = transactionsLoading || monthResult.key !== monthKey || !stats;
  const showUpcoming = isCurrentMonth && upcomingOccurrences(recurring, todayDateKey()).length > 0;
  const hasBudgets = Object.values(budgets).some((limit) => limit > 0);
  const monthName = formatMonthLabel(month, i18n.language);
  const monthParam = format(month, "yyyy-MM");
  const balance = stats?.balance || 0;
  const expenseShare = stats?.totalIncome > 0 ? (stats.totalExpense / stats.totalIncome) * 100 : null;
  const balanceLabel = balance < 0
    ? t("dashboard.overspent")
    : isCurrentMonth ? t("dashboard.leftThisMonth") : t("dashboard.monthBalance", { month: monthName });

  const handleRefresh = useCallback(async () => {
    if (isDemo || !currentUser) return;
    const requestId = ++requestIdRef.current;
    try {
      if (typeof navigator === "undefined" || navigator.onLine !== false) {
        await syncOfflineQueue?.();
        const { TransactionService } = await import("../../services/transactionService.jsx");
        TransactionService.invalidateCache();
      }
      const data = await fetchAllTransactions({ startDate, endDate, forceRefresh: true });
      if (requestId === requestIdRef.current) {
        setMonthResult({ key: monthKey, data });
        setLoadError("");
      }
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setLoadError(error.code === "permission-denied" ? t("security.emailVerificationRequired") : t("error"));
      }
    }
  }, [isDemo, currentUser, syncOfflineQueue, fetchAllTransactions, startDate, endDate, monthKey, t]);

  const confirmDelete = useCallback(async () => {
    if (!editing || deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    try {
      if (await deleteTransaction(editing.id)) {
        const requestId = ++requestIdRef.current;
        setMonthResult((previous) => ({ ...previous, data: previous.data.filter((item) => item.id !== editing.id) }));
        setDeleteConfirm(false);
        setEditing(null);
        if (!isDemo) {
          fetchAllTransactions({ startDate, endDate, forceRefresh: true }).then((data) => {
            if (requestId === requestIdRef.current) setMonthResult({ key: monthKey, data });
          }).catch((error) => {
            if (requestId === requestIdRef.current) {
              setLoadError(error.code === "permission-denied" ? t("security.emailVerificationRequired") : t("error"));
            }
          });
        }
      }
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }, [deleteTransaction, editing, isDemo, fetchAllTransactions, startDate, endDate, monthKey, t]);

  return (
    <PullToRefresh onRefresh={handleRefresh} disabled={isLoading}>
    <div className="page-shell dashboard-page">
      <header className="mobile-glass-header dashboard-header flex items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="dashboard-greeting pl-1 text-sm font-semibold text-muted-foreground md:pl-0">
            {profileNameLoading
              ? <Skeleton width={140} height={14} />
              : t(`dashboard.${getGreetingKey(localHour)}`, { name: profileName || t("profile.user") })}
          </p>
          <MonthSwitcher
            as="h1"
            month={month}
            onPrevious={goToPrevious}
            onNext={goToNext}
            canGoNext={canGoNext}
            className="dashboard-month-switcher -ml-3 md:-ml-3"
          />
          {startDay > 1 && (
            <p className="dashboard-cycle-range pl-1 text-xs font-semibold text-muted-foreground md:pl-0" data-testid="cycle-range">
              {formatCycleRange(startDate, endDate, i18n.language)}
            </p>
          )}
        </div>
        <HeaderProfileButton className="mt-1" />
      </header>

      {loadError && (
        <div role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {loadError}
        </div>
      )}

      <div className="dashboard-summary grid gap-4 lg:gap-5">
        <section
          aria-label={t("dashboard.summary")}
          className="flex flex-col gap-5 rounded-3xl bg-hero p-6 text-hero-foreground shadow-[0_12px_32px_rgb(29_78_216/0.25)] dark:border dark:border-white/10 dark:shadow-none sm:p-7 cols2:p-6 short:gap-4 short:p-5"
        >
          {isLoading ? (
            <Skeleton height={150} baseColor="rgba(255,255,255,0.14)" highlightColor="rgba(255,255,255,0.26)" borderRadius={16} />
          ) : (
            <>
              {/* In a narrow card (cols2, short) the privacy button moves under
                  the figure only when the figure itself does not fit beside
                  it; a long label wraps instead. */}
              <div className="flex flex-wrap items-start justify-between gap-3 cols2:gap-2 short:gap-2">
                <div className="min-w-0 space-y-1.5 cols2:flex-1 cols2:basis-0 short:flex-1 short:basis-0">
                  <p className="text-sm font-semibold text-hero-muted">{balanceLabel}</p>
                  <p className="amount [overflow-wrap:anywhere] text-[2.75rem] leading-none sm:text-5xl lg:text-[3.5rem] cols2:whitespace-nowrap cols2:text-[2.25rem] short:whitespace-nowrap short:text-[2rem]">
                    {balance < 0 ? formatSignedAmount(balance, "expense") : formatCurrency(balance)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    hapticTap();
                    toggleHideAmounts();
                  }}
                  aria-pressed={hideAmounts}
                  aria-label={hideAmounts ? t("privacy.showAmounts") : t("privacy.hideAmounts")}
                  title={hideAmounts ? t("privacy.showAmounts") : t("privacy.hideAmounts")}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-hero-foreground transition hover:bg-white/25"
                >
                  {hideAmounts ? <FiEyeOff className="h-[18px] w-[18px]" aria-hidden="true" /> : <FiEye className="h-[18px] w-[18px]" aria-hidden="true" />}
                </button>
              </div>
              {expenseShare !== null && (
                <div
                  className="h-2.5 overflow-hidden rounded-full bg-white/20"
                  role="img"
                  aria-label={t("dashboard.expenseShare", { percent: Math.round(expenseShare) })}
                >
                  <div className="h-full rounded-full bg-warning" style={{ width: `${Math.max(2, Math.min(100, expenseShare))}%` }} />
                </div>
              )}
              <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,6.5em),1fr))] gap-3 sm:gap-4 cols2:gap-3 short:gap-3">
                <div className="flex flex-col justify-between gap-0.5">
                  <dt className="text-sm font-semibold text-hero-muted short:text-xs">{t("dashboard.income")}</dt>
                  <dd className="amount whitespace-nowrap text-lg sm:text-xl cols2:text-base short:text-base">{formatSignedAmount(stats.totalIncome, "income")}</dd>
                </div>
                <div className="flex flex-col justify-between gap-0.5">
                  <dt className="text-sm font-semibold text-hero-muted short:text-xs">
                    {expenseShare !== null
                      ? t("dashboard.expensesWithShare", { percent: Math.round(expenseShare) })
                      : t("dashboard.expenses")}
                  </dt>
                  <dd className="amount whitespace-nowrap text-lg sm:text-xl cols2:text-base short:text-base">{formatSignedAmount(stats.totalExpense, "expense")}</dd>
                </div>
              </dl>
              {projection && (
                <details data-testid="month-projection" className="group border-t border-white/15 pt-3 text-sm text-hero-muted">
                  <summary className="flex cursor-pointer list-none items-center gap-2 rounded font-semibold">
                    <span className="flex-1">{t("dashboard.projectionLabel")}</span>
                    <span data-amount="true" className="tabular-nums text-hero-foreground">{formatCurrency(projection.projectedBalance)}</span>
                    <FiChevronRight aria-hidden="true" className="group-open:rotate-90" />
                  </summary>
                  <dl className="mt-3 space-y-2">
                    {[
                      ["current", formatCurrency(balance)],
                      ["income", formatSignedAmount(projection.remainingRecurringIncome, "income")],
                      ["expense", formatSignedAmount(projection.remainingRecurringExpense, "expense")],
                      ["scheduledIncome", formatSignedAmount(projection.scheduledIncome, "income")],
                      ["scheduledExpense", formatSignedAmount(projection.scheduledExpense, "expense")],
                      ["variable", formatSignedAmount(projection.remainingVariableExpense, "expense")],
                    ].map(([key, value]) => (
                      <div key={key} className="flex flex-wrap justify-between gap-x-2">
                        <dt>{t(`dashboard.forecast.${key}`, { days: projection.remainingDays })}</dt>
                        <dd data-amount="true" className="tabular-nums">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </>
          )}
        </section>

        <section className="recent-card surface space-y-3 p-4 sm:p-6" aria-labelledby="recent-transactions">
          <div className="flex items-baseline justify-between gap-3 px-1">
            <h2 id="recent-transactions" className="text-lg font-bold short:text-base">{t("recentTransactions.title")}</h2>
            <Link to="/transactions" className="text-sm font-semibold text-primary hover:underline">{t("recentTransactions.viewAll")}</Link>
          </div>
          <QuickAddForm preferences={preferences} />
          <RecentTransactions
            transactions={monthTransactions}
            loading={isLoading}
            onSelect={setEditing}
            onAddFirst={canAdd ? openAddTransaction : undefined}
            emptyLabel={t("dashboard.noTransactionsInMonth", { month: monthName })}
            limit={3}
          />
        </section>

        <section className="spending-card surface flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="where-money-goes">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="where-money-goes" className="text-lg font-bold cols2:text-base short:text-base">{t("dashboard.whereMoneyGoes")}</h2>
            <Link to="/analytics" className="text-sm font-semibold text-primary hover:underline">{t("navbar.analytics")}</Link>
          </div>
          {isLoading ? (
            <Skeleton height={120} borderRadius={12} />
          ) : spendingCategories.length ? (
            <>
              <div className="flex h-3 gap-[3px] overflow-hidden rounded-full" aria-hidden="true">
                {spendingCategories.map((item) => (
                  <span key={item.category} style={{ flexGrow: Math.max(item.percentage, 1), background: item.color }} />
                ))}
              </div>
              <ul className="space-y-1">
                {spendingCategories.map((item) => {
                  const rowBody = (
                    <>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-[4px]" style={{ background: item.color }} aria-hidden="true" />
                      <span className="spending-name min-w-0 flex-1 truncate font-semibold">{item.label}</span>
                      <span className="spending-figures flex shrink-0 items-center gap-3">
                        <span className="font-semibold tabular-nums" data-amount="true">{formatCurrency(item.amount)}</span>
                        <span className="w-10 text-right tabular-nums text-muted-foreground">{Math.round(item.percentage)}%</span>
                      </span>
                      {item.category !== "remaining" ? (
                        <FiChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
                      ) : (
                        <span className="h-4 w-4 shrink-0" aria-hidden="true" />
                      )}
                    </>
                  );
                  if (item.category === "remaining") {
                    return (
                      <li key={item.category} className="spending-row flex items-center gap-3 rounded-xl px-1.5 py-1.5 text-sm">
                        {rowBody}
                      </li>
                    );
                  }
                  const query = new URLSearchParams({ category: item.category, type: "expense", month: monthParam }).toString();
                  return (
                    <li key={item.category}>
                      <Link
                        to={`/transactions?${query}`}
                        className="spending-row flex items-center gap-3 rounded-xl px-1.5 py-1.5 text-sm transition-colors hover:bg-muted/60"
                      >
                        {rowBody}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("dashboard.noExpenses")}</p>
          )}
        </section>
      </div>

      {(showUpcoming || hasBudgets) && !isLoading && (
        <div className={showUpcoming && hasBudgets ? "grid grid-cols-1 gap-4 cols2:grid-cols-2 lg:grid-cols-2 lg:gap-5" : "grid grid-cols-1 gap-4"}>
          {showUpcoming && <UpcomingCard />}
          {hasBudgets && <BudgetCard breakdown={stats?.categoryBreakdown || {}} isCurrentMonth={isCurrentMonth} startDate={startDate} endDate={endDate} monthParam={monthParam} />}
        </div>
      )}

      {(!hasBudgets || !showUpcoming) && !isLoading && (
        <section className="surface space-y-3 p-4 md:hidden" aria-label={t("budgets.planning")}>
          <h2 className="font-bold">{t("budgets.planning")}</h2>
          <div className="flex flex-wrap gap-2">
            {!hasBudgets && <Link to="/budgets" className="chip">{t("budgets.title")}</Link>}
            {!showUpcoming && <Link to="/recurring" className="chip">{t("recurring.title")}</Link>}
          </div>
        </section>
      )}

      <TransactionModal
        show={Boolean(editing)}
        transaction={editing}
        onClose={() => setEditing(null)}
        onDelete={() => setDeleteConfirm(true)}
      />
      {editing && (
        <DeleteTransactionDialog
          open={deleteConfirm}
          transaction={editing}
          formatDate={(date) => formatGroupDate(date, i18n.language, t)}
          getCategoryLabel={(category) => t(`categories.${category}`, { defaultValue: category })}
          onCancel={() => setDeleteConfirm(false)}
          onConfirm={confirmDelete}
          busy={deleting}
        />
      )}
    </div>
    </PullToRefresh>
  );
};

export default Dashboard;
