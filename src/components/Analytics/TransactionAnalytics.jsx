import React, { useState, useEffect, useMemo } from "react";
import PropTypes from "prop-types";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";
import { useAuth } from "../../context/AuthProvider.jsx";
import { format, startOfMonth, endOfMonth, subMonths, isWithinInterval } from "date-fns";
import formatCurrency from "../../utils/formatCurrency.jsx";
import { useCategories } from "../../utils/categories.jsx";
import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Select } from "../ui/select";
import { Badge } from "../ui/badge";
import { FiBarChart, FiTrendingUp, FiTrendingDown, FiActivity, FiArrowUp, FiArrowDown } from "react-icons/fi";
import { generateExportFileName, getCurrentProfileName } from "../../utils/downloadUtils.jsx";
import { useDateRange } from "../../hooks/useDateRange.jsx";
import { calculateStats } from "../../utils/statsUtils.jsx";
import { useTheme } from "../../utils/ThemeProvider.jsx";
import {
  PieChart, Pie, Sector,
  AreaChart, Area,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const EXPENSE_CHART_COLORS = ["#f43f5e", "#fb923c", "#facc15", "#f97316", "#fb7185", "#ef4444"];
const INCOME_CHART_COLORS = ["#059669", "#0d9488", "#0284c7", "#2563eb", "#7c3aed", "#c026d3"];
const CategoryPieSector = (props) => <Sector {...props} />;

const TransactionAnalytics = () => {
  const { isDemo, transactions: recentTransactions, maxTransactions, loading: contextLoading, fetchAllTransactions } = useUnifiedTransactions();
  const { currentUser } = useAuth();
  const { expenseCategories, incomeCategories } = useCategories();
  const { t, i18n } = useTranslation();
  const { isDarkMode } = useTheme();

  // Use custom hook for date range management
  const { period, setPeriod, customRange, setCustomRange, startDate, endDate } = useDateRange(
    localStorage.getItem("analytics-period") ? JSON.parse(localStorage.getItem("analytics-period")).period : "month",
    localStorage.getItem("analytics-period") ? JSON.parse(localStorage.getItem("analytics-period")).customRange : null
  );

  const [analyticsData, setAnalyticsData] = useState([]);
  const [isLoadingAnalyticsData, setIsLoadingAnalyticsData] = useState(true);

  // Fetch full transaction history for analytics when component mounts or dependencies change
  useEffect(() => {
    const loadData = async () => {
      if (isDemo) {
        setAnalyticsData(recentTransactions);
        setIsLoadingAnalyticsData(false);
      } else if (currentUser) {
        setIsLoadingAnalyticsData(true);
        // Stale-while-revalidate: immediate cached data, then background refresh
        const data = await fetchAllTransactions({ onRevalidated: setAnalyticsData });
        setAnalyticsData(data);
        setIsLoadingAnalyticsData(false);
      } else {
        // Not demo and not logged in
        setAnalyticsData([]);
        setIsLoadingAnalyticsData(false);
      }
    };
    loadData();
  }, [isDemo, recentTransactions, currentUser, fetchAllTransactions]);

  // Persist preferences
  useEffect(() => {
    localStorage.setItem(
      "analytics-period",
      JSON.stringify({
        period,
        customRange,
      })
    );
  }, [period, customRange]);

  const stats = useMemo(() => {
    return calculateStats(analyticsData, startDate, endDate);
  }, [analyticsData, startDate, endDate]);

  // Extended stats logic specific to this view (Categories with percentages, Monthly Trend)
  const extendedStats = useMemo(() => {
    if (!analyticsData.length) return {};

    // 1. Categories with percentages
    const processCategories = (categoryMap, totalAmount, categoryList) => {
      return Object.entries(categoryMap)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([category, amount]) => {
          const categoryData = categoryList.find((c) => c.value === category);
          const rawLabel = categoryData?.label || t(`categories.${category}`, { defaultValue: category });
          return {
            category,
            amount,
            percentage: totalAmount > 0 ? (amount / totalAmount) * 100 : 0,
            label: rawLabel.replace(/^[^\p{L}\p{N}]+/u, "").trim(),
          };
        });
    };

    const filteredTransactions = analyticsData.filter((transaction) => {
      return transaction.date && isWithinInterval(transaction.date, { start: startDate, end: endDate });
    });

    const expenseByCategory = {};
    const incomeByCategory = {};

    filteredTransactions.forEach((t) => {
      if (t.type === "expense") {
        expenseByCategory[t.category] = (expenseByCategory[t.category] || 0) + t.amount;
      } else {
        incomeByCategory[t.category] = (incomeByCategory[t.category] || 0) + t.amount;
      }
    });

    const topExpenseCategories = processCategories(expenseByCategory, stats.totalExpense, expenseCategories);
    const topIncomeCategories = processCategories(incomeByCategory, stats.totalIncome, incomeCategories);

    // Largest individual movements in the selected period, rather than category totals.
    const getTopTransactions = (type) =>
      filteredTransactions
        .filter((transaction) => transaction.type === type)
        .sort((a, b) => b.amount - a.amount || b.date.getTime() - a.date.getTime())
        .slice(0, 3);

    const topExpenseTransactions = getTopTransactions("expense");
    const topIncomeTransactions = getTopTransactions("income");

    // 2. Monthly Trend (Last 6 months)
    const now = new Date();
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = startOfMonth(subMonths(now, i));
      const monthEnd = endOfMonth(subMonths(now, i));
      const monthTransactions = analyticsData.filter((t) =>
        t.date && isWithinInterval(t.date, { start: monthStart, end: monthEnd })
      );

      const monthIncome = monthTransactions.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
      const monthExpense = monthTransactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);

      monthlyTrend.push({
        month: format(monthStart, "MMM yyyy"),
        income: monthIncome,
        expense: monthExpense,
        balance: monthIncome - monthExpense,
      });
    }

    // 3. Averages
    const avgTransactionAmount =
      filteredTransactions.length > 0
        ? filteredTransactions.reduce((sum, t) => sum + t.amount, 0) / filteredTransactions.length
        : 0;

    // Savings Rate
    const savingsRate = stats.totalIncome > 0 ? ((stats.totalIncome - stats.totalExpense) / stats.totalIncome) * 100 : 0;

    return {
      topExpenseCategories,
      topIncomeCategories,
      topExpenseTransactions,
      topIncomeTransactions,
      monthlyTrend,
      avgTransactionAmount,
      savingsRate,
      filteredTransactions, // Needed for export
    };
  }, [analyticsData, startDate, endDate, stats, expenseCategories, incomeCategories, t]);

  const expensePieData = useMemo(
    () => (extendedStats.topExpenseCategories || []).map((category, index) => ({
      ...category,
      fill: EXPENSE_CHART_COLORS[index % EXPENSE_CHART_COLORS.length],
    })),
    [extendedStats.topExpenseCategories]
  );

  const incomePieData = useMemo(
    () => (extendedStats.topIncomeCategories || []).map((category, index) => ({
      ...category,
      fill: INCOME_CHART_COLORS[index % INCOME_CHART_COLORS.length],
    })),
    [extendedStats.topIncomeCategories]
  );

  const exportCsv = async () => {
    if (!extendedStats?.filteredTransactions?.length) return;
    const headers = ["Data", "Tipo", "Descrizione", "Categoria", "Importo"];
    const rows = extendedStats.filteredTransactions.map((t) => {
      return [
        format(t.date, "yyyy-MM-dd"),
        t.type,
        `"${(t.description || "").replace(/"/g, '""')}"`, // Corrected escaping for description
        t.category || "",
        t.amount,
      ];
    });
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const profileName = await getCurrentProfileName(currentUser);
    const filename = generateExportFileName(period, startDate, endDate, profileName, "csv");
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportPdf = async () => {
    if (!extendedStats?.filteredTransactions?.length || !startDate || !endDate) return;
    const profileName = await getCurrentProfileName(currentUser);
    const { generatePeriodPDFReport } = await import("../../utils/pdfUtils.jsx");
    await generatePeriodPDFReport(
      extendedStats.filteredTransactions,
      startDate,
      endDate,
      period === "custom"
        ? `${t("analytics.custom")} (${customRange.from} - ${customRange.to})`
        : period,
      i18n.language,
      profileName
    );
  };

  // Shared chart theme values
  const axisColor = isDarkMode ? "#94a3b8" : "#64748b";
  const gridColor = isDarkMode ? "#334155" : "#e2e8f0";
  const tooltipBg = isDarkMode ? "#1e293b" : "#ffffff";
  const tooltipBorder = isDarkMode ? "#334155" : "#e2e8f0";
  const tooltipTextColor = isDarkMode ? "#f1f5f9" : "#0f172a";

  const CustomAreaTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div
        className="rounded-lg border px-3 py-2 text-sm shadow-lg"
        style={{ background: tooltipBg, borderColor: tooltipBorder, color: tooltipTextColor }}
      >
        <p className="font-semibold mb-1">{label}</p>
        {payload.map((entry, i) => (
          <p key={i} style={{ color: entry.color }}>
            {entry.name}: {formatCurrency(entry.value)}
          </p>
        ))}
      </div>
    );
  };
  CustomAreaTooltip.propTypes = {
    active: PropTypes.bool,
    label: PropTypes.string,
    payload: PropTypes.arrayOf(PropTypes.shape({
      color: PropTypes.string,
      name: PropTypes.string,
      value: PropTypes.number,
    })),
  };

  const CustomPieTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const { name, value, payload: inner } = payload[0];
    return (
      <div
        className="rounded-lg border px-3 py-2 text-sm shadow-lg"
        style={{ background: tooltipBg, borderColor: tooltipBorder, color: tooltipTextColor }}
      >
        <p className="font-semibold">{name}</p>
        <p>{formatCurrency(value)}</p>
        <p className="text-xs opacity-75">{inner.percentage.toFixed(1)}%</p>
      </div>
    );
  };
  CustomPieTooltip.propTypes = {
    active: PropTypes.bool,
    payload: PropTypes.arrayOf(PropTypes.shape({
      name: PropTypes.string,
      value: PropTypes.number,
      payload: PropTypes.shape({ percentage: PropTypes.number }),
    })),
  };

  const CustomBarTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div
        className="rounded-lg border px-3 py-2 text-sm shadow-lg"
        style={{ background: tooltipBg, borderColor: tooltipBorder, color: tooltipTextColor }}
      >
        <p className="font-semibold mb-1">{label}</p>
        {payload.map((entry, i) => (
          <p key={i} style={{ color: entry.color }}>
            {entry.name}: {formatCurrency(entry.value)}
          </p>
        ))}
      </div>
    );
  };
  CustomBarTooltip.propTypes = {
    active: PropTypes.bool,
    label: PropTypes.string,
    payload: PropTypes.arrayOf(PropTypes.shape({
      color: PropTypes.string,
      name: PropTypes.string,
      value: PropTypes.number,
    })),
  };

  if (contextLoading || isLoadingAnalyticsData) {
    const skeletonBase = isDarkMode ? "#1e293b" : "#e2e8f0";
    const skeletonHighlight = isDarkMode ? "#334155" : "#f1f5f9";
    return (
      <SkeletonTheme baseColor={skeletonBase} highlightColor={skeletonHighlight}>
        <div className="space-y-4">
          <Skeleton height={48} />
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} height={120} borderRadius={18} />
            ))}
          </div>
          <Skeleton height={220} borderRadius={18} />
        </div>
      </SkeletonTheme>
    );
  }

  return (
    <div className="page-shell">
      <div className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-3xl font-bold flex items-center gap-2">
              <FiBarChart className="text-primary" /> {t("analytics.title")}
            </h2>
            <p className="text-muted-foreground">{t("analytics.subtitle")}</p>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4 md:flex-wrap">
            <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="md:w-48 h-11 self-center">
              <option value="month">{t("analytics.thisMonth")}</option>
              <option value="lastMonth">{t("analytics.lastMonth")}</option>
              <option value="last3Months">{t("analytics.last3Months")}</option>
              <option value="year">{t("analytics.thisYear")}</option>
              <option value="custom">{t("analytics.custom")}</option>
            </Select>
            {period === "custom" && (
              <div className="flex flex-wrap items-center gap-2 md:gap-3 text-sm md:items-center md:pl-1">
                <label className="text-muted-foreground text-xs md:text-sm leading-none">{t("analytics.from")}</label>
                <input
                  type="date"
                  value={customRange.from}
                  onChange={(e) => setCustomRange((r) => ({ ...r, from: e.target.value }))}
                  className="h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background md:min-w-[170px]"
                />
                <label className="text-muted-foreground text-xs md:text-sm leading-none">{t("analytics.to")}</label>
                <input
                  type="date"
                  value={customRange.to}
                  onChange={(e) => setCustomRange((r) => ({ ...r, to: e.target.value }))}
                  className="h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background md:min-w-[170px]"
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={exportCsv} disabled={!extendedStats?.filteredTransactions?.length}>
                {t("analytics.exportCsv")}
              </Button>
              <Button variant="outline" onClick={exportPdf} disabled={!extendedStats?.filteredTransactions?.length}>
                {t("analytics.exportPdf")}
              </Button>
            </div>
          </div>
        </div>
        {isDemo && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary flex items-center gap-2">
            <Badge variant="secondary">{recentTransactions.filter((t) => !t.isSample).length}/{maxTransactions}</Badge>
            <span>
              {t("analytics.demoDescription", {
                current: recentTransactions.filter((t) => !t.isSample).length,
                max: maxTransactions,
              })}
            </span>
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { title: t("analytics.totalIncome"), value: stats.totalIncome, icon: <FiTrendingUp />, color: "text-emerald-600" },
            { title: t("analytics.totalExpense"), value: stats.totalExpense, icon: <FiTrendingDown />, color: "text-rose-600" },
            { title: t("analytics.balance"), value: stats.balance, icon: <FiBarChart />, color: "text-primary" },
            { title: t("analytics.totalTransactions"), value: stats.transactionCount, icon: <FiActivity />, color: "text-muted-foreground" },
          ].map((item, idx) => (
            <Card key={idx}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <span className={`text-lg ${item.color}`}>{item.icon}</span>
                  {item.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">
                  {typeof item.value === "number" && idx !== 3 ? formatCurrency(item.value) : item.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Category distribution: donut chart + progress bars */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Expense categories */}
        <Card>
          <CardHeader>
            <CardTitle>{t("analytics.topExpenseCategories")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {extendedStats.topExpenseCategories?.length ? (
              <>
                {/* Donut chart */}
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={expensePieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={105}
                      paddingAngle={3}
                      dataKey="amount"
                      nameKey="label"
                      shape={CategoryPieSector}
                    />
                    <Tooltip content={<CustomPieTooltip />} isAnimationActive={false} />
                    <Legend
                      formatter={(value) => (
                        <span style={{ color: axisColor, fontSize: 12 }}>{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Progress bars */}
                <div className="space-y-3">
                  {extendedStats.topExpenseCategories.map((cat, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ background: EXPENSE_CHART_COLORS[idx % EXPENSE_CHART_COLORS.length] }}
                          />
                          <span className="font-semibold">{cat.label}</span>
                        </div>
                        <span className="text-rose-600 font-semibold">{formatCurrency(cat.amount)}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${cat.percentage.toFixed(1)}%`,
                            background: EXPENSE_CHART_COLORS[idx % EXPENSE_CHART_COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("analytics.noExpenseData")}</p>
            )}
          </CardContent>
        </Card>

        {/* Income categories */}
        <Card>
          <CardHeader>
            <CardTitle>{t("analytics.topIncomeCategories")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {extendedStats.topIncomeCategories?.length ? (
              <>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={incomePieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={105}
                      paddingAngle={3}
                      dataKey="amount"
                      nameKey="label"
                      shape={CategoryPieSector}
                    />
                    <Tooltip content={<CustomPieTooltip />} isAnimationActive={false} />
                    <Legend
                      formatter={(value) => (
                        <span style={{ color: axisColor, fontSize: 12 }}>{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-3">
                  {extendedStats.topIncomeCategories.map((cat, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ background: INCOME_CHART_COLORS[idx % INCOME_CHART_COLORS.length] }}
                          />
                          <span className="font-semibold">{cat.label}</span>
                        </div>
                        <span className="text-emerald-600 font-semibold">{formatCurrency(cat.amount)}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${cat.percentage.toFixed(1)}%`,
                            background: INCOME_CHART_COLORS[idx % INCOME_CHART_COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("analytics.noIncomeData")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Largest individual transactions */}
      <div className="grid gap-4 md:grid-cols-2">
        {[
          {
            title: t("analytics.topExpenseTransactions"),
            transactions: extendedStats.topExpenseTransactions,
            amountClass: "text-rose-600",
            emptyMessage: t("analytics.noExpenseData"),
            icon: <FiArrowDown />,
          },
          {
            title: t("analytics.topIncomeTransactions"),
            transactions: extendedStats.topIncomeTransactions,
            amountClass: "text-emerald-600",
            emptyMessage: t("analytics.noIncomeData"),
            icon: <FiArrowUp />,
          },
        ].map(({ title, transactions, amountClass, emptyMessage, icon }) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent>
              {transactions?.length ? (
                <ol className="space-y-3">
                  {transactions.map((transaction, index) => (
                    <li
                      key={transaction.id || `${transaction.description}-${transaction.date}`}
                      className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 sm:flex sm:gap-3"
                    >
                      <span className="row-span-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold sm:row-auto">
                        {index + 1}
                      </span>
                      <div className="min-w-0 sm:flex-1">
                        <p className="truncate text-sm font-semibold">{transaction.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {t(`categories.${transaction.category}`, { defaultValue: transaction.category })} · {format(transaction.date, "dd/MM/yyyy")}
                        </p>
                      </div>
                      <span className={`col-start-2 flex w-fit items-center gap-1 justify-self-end text-sm font-semibold sm:ml-auto sm:shrink-0 ${amountClass}`}>
                        {icon} {formatCurrency(transaction.amount)}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">{emptyMessage}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Monthly trend: area chart + card grid */}
      <Card>
        <CardHeader>
          <CardTitle>{t("analytics.monthlyTrend")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {extendedStats.monthlyTrend?.length ? (
            <>
              {/* Area chart */}
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={extendedStats.monthlyTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: axisColor, fontSize: 12 }}
                    axisLine={{ stroke: gridColor }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => formatCurrency(v)}
                    tick={{ fill: axisColor, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={80}
                  />
                  <Tooltip content={<CustomAreaTooltip />} />
                  <Legend
                    formatter={(value) => (
                      <span style={{ color: axisColor, fontSize: 12 }}>{value}</span>
                    )}
                  />
                  <Area
                    type="monotone"
                    dataKey="income"
                    name={t("analytics.totalIncome")}
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#incomeGrad)"
                    dot={{ r: 3, fill: "#10b981" }}
                    activeDot={{ r: 5 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="expense"
                    name={t("analytics.totalExpense")}
                    stroke="#f43f5e"
                    strokeWidth={2}
                    fill="url(#expenseGrad)"
                    dot={{ r: 3, fill: "#f43f5e" }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>

              {/* Card grid with balance */}
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
                {extendedStats.monthlyTrend.map((month, idx) => (
                  <div
                    key={idx}
                    className={`rounded-xl border border-border p-3 ${
                      month.balance >= 0 ? "bg-emerald-500/5" : "bg-rose-500/5"
                    }`}
                  >
                    <p className="text-sm font-semibold">{month.month}</p>
                    <div className="flex items-center gap-1 text-xs text-emerald-600">
                      <FiArrowUp /> {formatCurrency(month.income)}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-rose-600">
                      <FiArrowDown /> {formatCurrency(month.expense)}
                    </div>
                    <p className={`text-sm font-semibold ${month.balance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {formatCurrency(month.balance)}
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("analytics.insufficientData")}</p>
          )}
        </CardContent>
      </Card>

      {/* Period income vs expense bar chart + savings rate */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("analytics.incomeVsExpense", { defaultValue: "Income vs Expense" })}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={[
                  {
                    name: t("analytics.selectedPeriod", { defaultValue: "Period" }),
                    [t("analytics.totalIncome")]: stats.totalIncome,
                    [t("analytics.totalExpense")]: stats.totalExpense,
                  },
                ]}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="name" tick={{ fill: axisColor, fontSize: 12 }} axisLine={{ stroke: gridColor }} tickLine={false} />
                <YAxis
                  tickFormatter={(v) => formatCurrency(v)}
                  tick={{ fill: axisColor, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={80}
                />
                <Tooltip content={<CustomBarTooltip />} />
                <Legend
                  formatter={(value) => (
                    <span style={{ color: axisColor, fontSize: 12 }}>{value}</span>
                  )}
                />
                <Bar dataKey={t("analytics.totalIncome")} fill="#10b981" radius={[6, 6, 0, 0]} />
                <Bar dataKey={t("analytics.totalExpense")} fill="#f43f5e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Savings rate */}
        <Card>
          <CardHeader>
            <CardTitle>{t("analytics.savingsRate", { defaultValue: "Savings Rate" })}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col justify-center h-[calc(100%-4rem)] space-y-4">
            {stats.totalIncome > 0 ? (
              <>
                <p className={`text-4xl font-bold ${(extendedStats.savingsRate ?? 0) >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                  {(extendedStats.savingsRate ?? 0).toFixed(1)}%
                </p>
                <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-3 rounded-full transition-all duration-700 ${
                      (extendedStats.savingsRate ?? 0) >= 0 ? "bg-emerald-500" : "bg-rose-500"
                    }`}
                    style={{ width: `${Math.min(Math.abs(extendedStats.savingsRate ?? 0), 100).toFixed(1)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{t("analytics.inSelectedPeriod")}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("analytics.insufficientData")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Metric cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("analytics.avgDailyExpense")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-primary">{formatCurrency(stats.dailyAverageExpense || 0)}</p>
            <p className="text-xs text-muted-foreground">{t("analytics.inSelectedPeriod")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("analytics.avgTransaction")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-primary">{formatCurrency(extendedStats.avgTransactionAmount || 0)}</p>
            <p className="text-xs text-muted-foreground">{t("analytics.avgTransactionDescription")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("analytics.totalTransactions")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-primary">{stats.transactionCount || 0}</p>
            <p className="text-xs text-muted-foreground">{t("analytics.inSelectedPeriod")}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default React.memo(TransactionAnalytics);
