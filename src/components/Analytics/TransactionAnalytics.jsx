import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { format } from "date-fns";
import { enUS, it } from "date-fns/locale";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";
import { useAuth } from "../../context/AuthProvider.jsx";
import formatCurrency from "../../utils/formatCurrency.jsx";
import { useCategories } from "../../utils/categories.jsx";
import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useDateRange } from "../../hooks/useDateRange.jsx";
import { useAnalyticsData } from "../../hooks/useAnalyticsData.js";
import { SeriesTooltip } from "./ChartTooltips.jsx";
import {
  CATEGORY_CHART_COLORS, PERIOD_PREFERENCE_KEY, buildExtendedStats, categoryDeltas, compareValues,
  getComparisonRange, getEffectiveEnd, readPeriodPreference, withChartColors,
} from "../../utils/analyticsModel";
import { exportAnalyticsCsv, exportAnalyticsPdf } from "../../utils/analyticsExport";
import { calculateStats } from "../../utils/statsUtils.jsx";
import { formatRowDate } from "../../utils/transactionGrouping.js";
import { useTheme } from "../../utils/ThemeProvider.jsx";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { writeLocalValue } from "../../utils/storage.js";
import { cn } from "../../lib/utils";
import TransactionRow from "../Transaction/TransactionRow.jsx";
import { Link } from "../../router/RouterProvider";
import { usePlanning } from "../../context/PlanningProvider.jsx";
import HeaderProfileButton from "../Layout/HeaderProfileButton.jsx";
import { FiDownload } from "react-icons/fi";

const PERIODS = ["month", "lastMonth", "last3Months", "year", "custom"];

// Concrete colours for SVG attributes (CSS variables do not resolve there).
const CHART_THEME = {
  light: { income: "#0b7a55", expense: "#c3c8d2", axis: "#5d6370", grid: "#e6e8ec", tooltip: { background: "#ffffff", border: "#e0e3e9", text: "#141924" } },
  dark: { income: "#3dcd93", expense: "#5c6370", axis: "#9aa1ae", grid: "#232834", tooltip: { background: "#1a1e27", border: "#2a303c", text: "#eceff4" } },
};

const DELTA_TONE = {
  good: "text-income",
  bad: "text-warning-strong",
  neutral: "text-muted-foreground",
};

const KpiTile = ({ label, value, note, tone, delta }) => (
  <div className="surface flex flex-col gap-1 p-4 sm:p-5">
    <span className="text-[13px] font-semibold text-muted-foreground">{label}</span>
    <span className={cn("amount text-2xl sm:text-[1.75rem]", tone === "income" && "text-income")}>{value}</span>
    {note && <span className="text-xs font-medium text-muted-foreground">{note}</span>}
    {delta && <span className={cn("text-xs font-bold", DELTA_TONE[delta.tone])} data-testid="kpi-delta">{delta.text}</span>}
  </div>
);

const TransactionAnalytics = () => {
  const { isDemo, transactions: recentTransactions, maxTransactions, loading: contextLoading, fetchAllTransactions } = useUnifiedTransactions();
  const { currentUser } = useAuth();
  const { expenseCategories, incomeCategories } = useCategories();
  const { t, i18n } = useTranslation();
  const { isDarkMode } = useTheme();
  const [categoryType, setCategoryType] = useState("expense");
  const { budgets, ready: planningReady } = usePlanning();
  const showBudgetInvite = planningReady && categoryType === "expense" && Object.keys(budgets).length === 0;

  const initialPreference = useMemo(readPeriodPreference, []);
  const { period, setPeriod, customRange, setCustomRange, startDate, endDate } = useDateRange(
    initialPreference.period,
    initialPreference.customRange
  );

  const effectiveEnd = useMemo(() => getEffectiveEnd(endDate), [endDate]);
  const comparison = useMemo(() => getComparisonRange(period, startDate, endDate), [period, startDate, endDate]);

  const { analyticsData, isLoadingAnalyticsData, analyticsError } = useAnalyticsData({
    isDemo, recentTransactions, currentUser, fetchAllTransactions, startDate, endDate, compareStart: comparison.startDate,
  });

  useEffect(() => {
    writeLocalValue(PERIOD_PREFERENCE_KEY, JSON.stringify({ period, customRange }));
  }, [period, customRange]);

  // Averages run over the days that have actually passed, not the whole month.
  const stats = useMemo(() => calculateStats(analyticsData, startDate, effectiveEnd), [analyticsData, startDate, effectiveEnd]);
  const previousStats = useMemo(
    () => calculateStats(analyticsData, comparison.startDate, comparison.endDate),
    [analyticsData, comparison]
  );

  const extendedStats = useMemo(() => buildExtendedStats({
    analyticsData, startDate, endDate, stats, expenseCategories, incomeCategories, t,
  }), [analyticsData, startDate, endDate, stats, expenseCategories, incomeCategories, t]);

  const categoryList = useMemo(() => withChartColors(
    categoryType === "expense" ? extendedStats.topExpenseCategories : extendedStats.topIncomeCategories,
    CATEGORY_CHART_COLORS
  ), [categoryType, extendedStats.topExpenseCategories, extendedStats.topIncomeCategories]);
  const topList = categoryType === "expense" ? extendedStats.topExpenseTransactions : extendedStats.topIncomeTransactions;

  const chart = isDarkMode ? CHART_THEME.dark : CHART_THEME.light;
  const locale = i18n.language === "en" ? enUS : it;

  const hasPreviousData = previousStats.transactionCount > 0;
  const reference = comparison.kind === "month"
    ? format(comparison.startDate, "LLLL", { locale })
    : comparison.kind === "year"
      ? format(comparison.startDate, "yyyy")
      : t("analytics.compare.previousPeriod");
  const describeDelta = (current, previous, higherIsBetter) => {
    if (!hasPreviousData) return null;
    const change = compareValues(current, previous);
    if (!change) return null;
    if (change.direction === "flat") return { text: t("analytics.compare.flat", { ref: reference }), tone: "neutral" };
    const better = (change.direction === "up") === higherIsBetter;
    return {
      text: t(change.direction === "up" ? "analytics.compare.up" : "analytics.compare.down", { pct: change.pct, ref: reference }),
      tone: better ? "good" : "bad",
    };
  };
  const deltasByCategory = useMemo(
    () => (hasPreviousData
      ? categoryDeltas(analyticsData, categoryType, { startDate, endDate: effectiveEnd }, comparison)
      : {}),
    [hasPreviousData, analyticsData, categoryType, startDate, effectiveEnd, comparison]
  );
  const trend = useMemo(() => (extendedStats.monthlyTrend || []).map((month) => ({
    ...month,
    label: format(month.monthStart, "MMM", { locale }).replace(".", ""),
  })), [extendedStats.monthlyTrend, locale]);
  const hasTrend = trend.some((month) => month.income > 0 || month.expense > 0);

  const exportCsv = () => exportAnalyticsCsv({
    transactions: extendedStats.filteredTransactions, currentUser, period, startDate, endDate,
  });
  const exportPdf = () => exportAnalyticsPdf({
    transactions: extendedStats.filteredTransactions, currentUser, period, customRange, startDate, endDate,
    t, language: i18n.language,
  });
  const canExport = !!extendedStats?.filteredTransactions?.length;

  if (contextLoading || isLoadingAnalyticsData) {
    return (
      <SkeletonTheme baseColor={isDarkMode ? "#1a1e27" : "#e6e8ec"} highlightColor={isDarkMode ? "#232834" : "#f3f4f6"}>
        <div className="page-shell">
          <Skeleton height={44} width={200} borderRadius={12} />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} height={104} borderRadius={18} />)}
          </div>
          <Skeleton height={280} borderRadius={18} />
        </div>
      </SkeletonTheme>
    );
  }

  const savingsRate = stats.totalIncome > 0 ? extendedStats.savingsRate ?? 0 : null;
  const demoCount = recentTransactions.filter((item) => !item.isSample).length;

  return (
    <div className="page-shell">
      {analyticsError && (
        <div role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {analyticsError}
        </div>
      )}

      <header className="space-y-4">
        <div className="mobile-glass-header flex flex-wrap items-center justify-between gap-3">
          <h1 className="pl-1 text-[1.75rem] font-extrabold leading-tight md:pl-0 md:text-3xl">{t("analytics.title")}</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!canExport} aria-label={t("analytics.exportCsv")}>
              <FiDownload aria-hidden="true" className="sm:hidden" />
              <span className="sm:hidden">CSV</span>
              <span className="hidden sm:inline">{t("analytics.exportCsv")}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={exportPdf} disabled={!canExport} aria-label={t("analytics.exportPdf")}>
              <FiDownload aria-hidden="true" className="sm:hidden" />
              <span className="sm:hidden">PDF</span>
              <span className="hidden sm:inline">{t("analytics.exportPdf")}</span>
            </Button>
            <HeaderProfileButton className="ml-1" />
          </div>
        </div>
        <div
          role="radiogroup"
          aria-label={t("analytics.period")}
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none md:mx-0 md:flex-wrap md:px-0"
          data-swipe-ignore="true"
        >
          {PERIODS.map((value) => (
            <button key={value} type="button" role="radio" aria-checked={period === value} className="chip" onClick={() => setPeriod(value)}>
              {t(`analytics.periods.${value}`)}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              {t("analytics.from")}
              <Input type="date" value={customRange.from} onChange={(event) => setCustomRange((range) => ({ ...range, from: event.target.value }))} className="w-44" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              {t("analytics.to")}
              <Input type="date" value={customRange.to} onChange={(event) => setCustomRange((range) => ({ ...range, to: event.target.value }))} className="w-44" />
            </label>
          </div>
        )}
        {isDemo && (
          <p className="px-1 text-sm text-muted-foreground">
            {t("analytics.demoDescription", { current: demoCount, max: maxTransactions })}
          </p>
        )}
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4" aria-label={t("analytics.summary")}>
        <KpiTile
          label={t("dashboard.income")}
          value={formatCurrency(stats.totalIncome)}
          tone="income"
          delta={describeDelta(stats.totalIncome, previousStats.totalIncome, true)}
        />
        <KpiTile
          label={t("dashboard.expenses")}
          value={formatCurrency(stats.totalExpense)}
          delta={describeDelta(stats.totalExpense, previousStats.totalExpense, false)}
        />
        <KpiTile
          label={t("analytics.saved")}
          value={savingsRate === null ? "—" : `${Math.round(savingsRate)}%`}
          note={stats.balance >= 0
            ? t("analytics.savedAmount", { amount: formatCurrency(stats.balance) })
            : t("analytics.overspentAmount", { amount: formatCurrency(Math.abs(stats.balance)) })}
          delta={describeDelta(stats.balance, previousStats.balance, true)}
        />
        <KpiTile
          label={t("analytics.avgDailyExpense")}
          value={formatCurrency(stats.dailyAverageExpense || 0)}
          note={t("transactions.summary.count", { count: stats.transactionCount || 0 })}
          delta={describeDelta(stats.dailyAverageExpense, previousStats.dailyAverageExpense, false)}
        />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-5">
        <section className="surface flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="trend-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="trend-title" className="text-lg font-bold">{t("analytics.monthlyTrend")}</h2>
            <div className="flex gap-4 text-[13px] font-semibold text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[4px]" style={{ background: chart.income }} />{t("dashboard.income")}</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[4px]" style={{ background: chart.expense }} />{t("dashboard.expenses")}</span>
            </div>
          </div>
          {hasTrend ? (
            <div className="h-64 sm:h-72" data-swipe-ignore="true">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={4} barCategoryGap="22%">
                  <CartesianGrid vertical={false} stroke={chart.grid} />
                  <XAxis dataKey="label" tick={{ fill: chart.axis, fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tickFormatter={(value) => formatCurrency(value).replace(/,00\s?/, " ")}
                    tick={{ fill: chart.axis, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={72}
                  />
                  <Tooltip cursor={{ fill: chart.grid, opacity: 0.5 }} content={<SeriesTooltip colors={chart.tooltip} />} />
                  <Bar dataKey="income" name={t("dashboard.income")} fill={chart.income} radius={[6, 6, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="expense" name={t("dashboard.expenses")} fill={chart.expense} radius={[6, 6, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("analytics.insufficientData")}</p>
          )}
        </section>

        <section className="surface flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="category-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="category-title" className="text-lg font-bold">{t("analytics.byCategory")}</h2>
            <div role="radiogroup" aria-label={t("analytics.byCategory")} className="segmented grid-cols-2 p-0.5">
              {["expense", "income"].map((type) => (
                <button key={type} type="button" role="radio" aria-checked={categoryType === type} className="!h-8 !px-3 !text-[13px]" onClick={() => setCategoryType(type)}>
                  {type === "expense" ? t("dashboard.expenses") : t("dashboard.income")}
                </button>
              ))}
            </div>
          </div>

          {categoryList.length ? (
            <ul className="space-y-3.5">
              {categoryList.map((category) => (
                <li key={category.category} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate font-semibold">{category.label}</span>
                      <CategoryDelta
                        value={deltasByCategory[category.category]}
                        higherIsBetter={categoryType === "income"}
                        label={t("analytics.compare.categoryLabel", { ref: reference })}
                      />
                    </span>
                    <span className="shrink-0 tabular-nums">
                      <strong className="font-semibold">{formatCurrency(category.amount)}</strong>
                      <span className="ml-1.5 text-muted-foreground">{Math.round(category.percentage)}%</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(category.percentage, 2)}%`, background: category.fill }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">
              {categoryType === "expense" ? t("analytics.noExpenseData") : t("analytics.noIncomeData")}
            </p>
          )}

          {showBudgetInvite && categoryList.length > 0 && (
            <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl bg-accent px-3 py-2.5 text-[13px] text-accent-foreground">
              <span className="text-foreground/80">{t("budgets.invite")}</span>
              <Link to="/budgets" className="font-bold hover:underline">{t("budgets.inviteAction")}</Link>
            </p>
          )}

          {topList?.length > 0 && (
            <div className="space-y-1 border-t border-border pt-4">
              <h3 className="font-sans text-[13px] font-bold text-muted-foreground">
                {categoryType === "expense" ? t("analytics.topExpenseTransactions") : t("analytics.topIncomeTransactions")}
              </h3>
              <ul className="divide-y divide-border">
                {topList.map((transaction) => (
                  <li key={transaction.id || `${transaction.description}-${transaction.date}`}>
                    <TransactionRow
                      transaction={transaction}
                      meta={`${t(`categories.${transaction.category}`, { defaultValue: transaction.category })} · ${formatRowDate(transaction.date, i18n.language, t)}`}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

    </div>
  );
};

const CategoryDelta = ({ value, higherIsBetter, label }) => {
  if (!value || Math.abs(value) < 1) return null;
  const better = (value > 0) === higherIsBetter;
  const amount = formatCurrency(Math.abs(value)).replace(/,00(?=\s|$)/, "");
  return (
    <span
      className={cn("shrink-0 text-xs font-bold tabular-nums", better ? "text-income" : "text-warning-strong")}
      title={label}
      data-testid="category-delta"
    >
      <span className="sr-only">{label}: </span>
      {value > 0 ? "+" : "−"}{amount}
    </span>
  );
};

CategoryDelta.propTypes = {
  value: PropTypes.number,
  higherIsBetter: PropTypes.bool,
  label: PropTypes.string.isRequired,
};

KpiTile.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  note: PropTypes.string,
  tone: PropTypes.string,
  delta: PropTypes.shape({ text: PropTypes.string, tone: PropTypes.string }),
};

export default React.memo(TransactionAnalytics);
