import { useEffect, useMemo, useState } from "react";
import React from "react";
import { useTranslation } from "react-i18next";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { useAuth } from "../../context/AuthProvider.jsx";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";
import RecentTransactions from "./RecentTransactions";
import formatCurrency from "../../utils/formatCurrency.jsx";
import { calculateStats, getPeriodRange } from "../../utils/statsUtils.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Select } from "../ui/select";

const PERIOD_OPTIONS = ["daily", "weekly", "monthly", "last3Months", "all"];
const DASHBOARD_PERIOD_STORAGE_KEY = "dashboard-period";
const SPENDING_COLORS = ["#3b82f6", "#8b5cf6", "#f97316", "#10b981", "#ec4899"];

const getGreetingKey = (hour) => {
  if (hour < 12) return "greetingMorning";
  if (hour < 18) return "greetingAfternoon";
  return "greetingEvening";
};

const Dashboard = () => {
  const { currentUser, profileName, profileNameLoading } = useAuth();
  const { transactions, isDemo, loading: transactionsLoading, fetchAllTransactions } = useUnifiedTransactions();
  const { t } = useTranslation();
  const [dashboardData, setDashboardData] = useState([]);
  const [localHour, setLocalHour] = useState(() => new Date().getHours());
  const [periodPref, setPeriodPref] = useState(() => {
    const saved = localStorage.getItem(DASHBOARD_PERIOD_STORAGE_KEY);
    if (!saved) return { period: "monthly" };

    try {
      const parsed = JSON.parse(saved);
      return PERIOD_OPTIONS.includes(parsed?.period) ? parsed : { period: "monthly" };
    } catch {
      return { period: "monthly" };
    }
  });
  const { start: periodStart, end: periodEnd } = useMemo(
    () => getPeriodRange(periodPref.period || "monthly", periodPref.customRange),
    [periodPref.period, periodPref.customRange]
  );

  useEffect(() => {
    const load = async () => {
      if (isDemo) {
        setDashboardData(transactions);
      } else if (currentUser) {
        const data = await fetchAllTransactions({
          startDate: periodStart,
          endDate: periodEnd,
          onRevalidated: setDashboardData,
        });
        setDashboardData(data);
      } else {
        setDashboardData([]);
      }
    };
    load();
  }, [isDemo, transactions, currentUser, fetchAllTransactions, periodStart, periodEnd]);

  useEffect(() => {
    localStorage.setItem(DASHBOARD_PERIOD_STORAGE_KEY, JSON.stringify(periodPref));
  }, [periodPref]);

  useEffect(() => {
    const refreshLocalHour = () => setLocalHour(new Date().getHours());
    const intervalId = window.setInterval(refreshLocalHour, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const stats = useMemo(() => {
    if (transactionsLoading) return null;
    return calculateStats(dashboardData, periodStart, periodEnd);
  }, [dashboardData, periodStart, periodEnd, transactionsLoading]);

  const spendingCategories = useMemo(() => {
    const categories = Object.entries(stats?.categoryBreakdown || {})
      .sort(([, first], [, second]) => second - first);
    const topCategories = categories.slice(0, 4).map(([category, amount]) => ({
      category,
      label: t(`categories.${category}`, { defaultValue: category }),
      amount,
    }));
    const remainingAmount = categories.slice(4).reduce((sum, [, amount]) => sum + amount, 0);

    if (remainingAmount > 0) {
      topCategories.push({ category: "remaining", label: t("dashboard.remainingCategories"), amount: remainingAmount });
    }

    return topCategories.map((category, index) => ({
      ...category,
      color: SPENDING_COLORS[index % SPENDING_COLORS.length],
      percentage: stats?.totalExpense ? (category.amount / stats.totalExpense) * 100 : 0,
    }));
  }, [stats, t]);

  const spendingGradient = useMemo(() => {
    if (!spendingCategories.length) return "conic-gradient(hsl(var(--muted)) 0 100%)";

    let currentStop = 0;
    return `conic-gradient(${spendingCategories.map((category) => {
      const nextStop = currentStop + category.percentage;
      const segment = `${category.color} ${currentStop.toFixed(2)}% ${nextStop.toFixed(2)}%`;
      currentStop = nextStop;
      return segment;
    }).join(", ")})`;
  }, [spendingCategories]);

  const isLoading = transactionsLoading;

  return (
    <div className="page-shell space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-lg font-semibold text-primary">
            {profileNameLoading ? <Skeleton circle height={24} width={24} /> : (profileName || "?").charAt(0).toUpperCase()}
          </div>
          <div>
            {profileNameLoading ? (
              <Skeleton height={32} width={260} />
            ) : (
              <h2 className="text-2xl font-bold sm:text-3xl">
                {t(`dashboard.${getGreetingKey(localHour)}`, { name: profileName || t("profile.user") })}
              </h2>
            )}
            <p className="text-sm text-muted-foreground">{t("dashboard.overviewSubtitle")}</p>
          </div>
        </div>
        <div className="w-full sm:w-48">
          <label className="sr-only" htmlFor="dashboard-period">{t("dashboard.periodSummary")}</label>
          <Select
            id="dashboard-period"
            value={periodPref.period || "monthly"}
            onChange={(event) => setPeriodPref((previous) => ({ ...previous, period: event.target.value }))}
          >
            {PERIOD_OPTIONS.map((period) => (
              <option key={period} value={period}>
                {t(`periods.${period}`, { defaultValue: period })}
              </option>
            ))}
          </Select>
        </div>
      </header>

      <Card
        className="relative overflow-hidden border-0 shadow-xl"
        style={{
          backgroundColor: "#1d4ed8",
          backgroundImage: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 52%, #4338ca 100%)",
          color: "#ffffff",
        }}
      >
        <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
        <CardContent className="relative p-6 pt-8 sm:p-8">
          {isLoading || !stats ? (
            <Skeleton height={110} baseColor="rgba(255,255,255,0.16)" highlightColor="rgba(255,255,255,0.28)" />
          ) : (
            <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
              <div>
                <p className="text-sm font-medium text-white/75">{t("dashboard.cashflow")}</p>
                <p className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">{formatCurrency(stats.balance || 0)}</p>
                <p className="mt-2 text-sm text-white/80">
                  {t("dashboard.periodSummary")} · {stats.transactionCount} {t("financialOverview.totalTransactions").toLowerCase()}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm sm:min-w-64">
                <div className="border-r border-white/25 px-3 text-center">
                  <p className="text-white/70">{t("financialOverview.totalIncome")}</p>
                  <p className="mt-1 text-lg font-semibold">{formatCurrency(stats.totalIncome || 0)}</p>
                </div>
                <div className="px-3 text-center">
                  <p className="text-white/70">{t("financialOverview.totalExpense")}</p>
                  <p className="mt-1 text-lg font-semibold">{formatCurrency(stats.totalExpense || 0)}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.65fr)]">
        <Card>
          <CardHeader className="items-start justify-between space-y-0" style={{ flexDirection: "row" }}>
            <div>
              <CardTitle className="text-left">{t("dashboard.spendingOverview")}</CardTitle>
              <span className="text-sm text-muted-foreground">{t(`periods.${periodPref.period}`)}</span>
            </div>
            {!isLoading && stats && spendingCategories.length > 0 && (
              <div className="text-right">
                <p className="text-lg font-bold">{formatCurrency(stats.totalExpense)}</p>
                <p className="text-xs text-muted-foreground">{t("dashboard.ofExpenses")}</p>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {isLoading || !stats ? (
              <Skeleton height={180} />
            ) : spendingCategories.length ? (
              <div className="space-y-4">
                <div className="relative">
                  <div className="space-y-3 sm:pr-44">
                    {spendingCategories.map((category) => (
                      <div key={category.category} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="flex min-w-0 items-center gap-2 font-medium">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: category.color }} />
                            <span className="truncate">{category.label}</span>
                          </span>
                          <span className="shrink-0 text-muted-foreground">{category.percentage.toFixed(0)}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full" style={{ width: `${category.percentage}%`, background: category.color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="absolute right-0 top-1/2 hidden h-36 w-36 -translate-y-1/2 rounded-full sm:block" style={{ background: spendingGradient }} aria-label={t("dashboard.spendingOverview")}>
                    <div className="absolute inset-7 rounded-full bg-card" />
                  </div>
                </div>
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">{t("dashboard.noExpenses")}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.periodActivity")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {isLoading || !stats ? (
              <Skeleton height={150} />
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <span className="text-sm text-muted-foreground">{t("dashboard.largestExpense")}</span>
                  {stats.largestExpense ? (
                    <div className="min-w-0 text-right">
                      <p className="max-w-32 truncate font-semibold">{stats.largestExpense.description}</p>
                      <p className="text-sm font-semibold text-rose-600">{formatCurrency(stats.largestExpense.amount)}</p>
                    </div>
                  ) : (
                    <span className="font-semibold text-muted-foreground">—</span>
                  )}
                </div>
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <span className="text-sm text-muted-foreground">{t("dashboard.topExpenseCategory")}</span>
                  {stats.topCategories[0] ? (
                    <span className="text-right font-semibold">
                      {t(`categories.${stats.topCategories[0].category}`, { defaultValue: stats.topCategories[0].category })}
                    </span>
                  ) : (
                    <span className="font-semibold text-muted-foreground">—</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t("financialOverview.totalTransactions")}</span>
                  <span className="text-xl font-bold">{stats.transactionCount}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("recentTransactions.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <RecentTransactions transactions={dashboardData} loading={isLoading} />
        </CardContent>
      </Card>
    </div>
  );
};

export default React.memo(Dashboard);
