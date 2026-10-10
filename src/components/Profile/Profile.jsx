import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { differenceInCalendarDays, differenceInCalendarMonths, format } from "date-fns";
import { enUS, it } from "date-fns/locale";
import {
  FiCalendar, FiDatabase, FiDownload, FiEdit2, FiGlobe, FiGrid, FiKey, FiLock, FiMail, FiMoon, FiPlusCircle,
  FiRepeat, FiSmartphone, FiTarget, FiTrash2,
} from "react-icons/fi";
import { useAuth } from "../../context/AuthProvider.jsx";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";
import { usePlanning } from "../../context/PlanningProvider.jsx";
import { useTheme } from "../../utils/ThemeProvider";
import { useNotification } from "../../utils/notificationUtils";
import { Link, useNavigate } from "../../router/RouterProvider";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import Sheet from "../ui/sheet";
import BackButton from "../Planning/BackButton.jsx";
import { SettingsGroup, SettingsRow, InlineSegmented } from "./SettingsList.jsx";
import { CategoriesSheet, EmailSheet, ExportSheet, InstallSheet, MonthStartSheet, NameSheet, PasswordSheet, QuickAddSheet } from "./ProfileSheets.jsx";
import { buildAccountExport, downloadJson } from "../../utils/accountExport.js";
import { deleteCurrentAccount } from "../../services/accountService.js";
import { removeLocalValue, writeLocalValue } from "../../utils/storage.js";
import { useInstallPrompt } from "../../utils/installPrompt.js";
import { useCategories } from "../../utils/categories.jsx";
import { calculateStats } from "../../utils/statsUtils.jsx";
import { budgetRows } from "../../utils/budgets.js";
import { monthlyEquivalentMinor } from "../../utils/recurrence.js";
import { cycleMonthFor, cycleRange } from "../../utils/monthCycle.js";
import formatCurrency, { formatSignedAmount } from "../../utils/formatCurrency.jsx";
import { minorToMajor } from "../../utils/money.js";
import { cn } from "../../lib/utils";

// Account deletion relies on the deleteAccount Cloud Function (Blaze plan).
// Enable it at build time with VITE_ENABLE_ACCOUNT_DELETION=true once it is deployed.
const ACCOUNT_DELETION_ENABLED = import.meta.env.VITE_ENABLE_ACCOUNT_DELETION === "true";
const BACKUP_REMINDER_DAYS = 30;

const compactCurrency = (value) => formatCurrency(value).replace(/,00(?=\s|$)/, "");

/** Movements, months tracked and average monthly saving across the whole history. */
const useAccountSummary = () => {
  const { isDemo, transactions, getTotalTransactionCount, getTransactionTotals, getFirstTransactionDate, recentRevision } = useUnifiedTransactions();
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let count; let incomeMinor; let expenseMinor; let firstDate;
        if (isDemo) {
          count = transactions.length;
          incomeMinor = transactions.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amountMinor, 0);
          expenseMinor = transactions.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amountMinor, 0);
          firstDate = transactions.reduce((min, item) => (!min || item.date < min ? item.date : min), null);
        } else {
          const [total, totals, first] = await Promise.all([getTotalTransactionCount({}), getTransactionTotals({}), getFirstTransactionDate()]);
          count = total;
          incomeMinor = totals.incomeMinor;
          expenseMinor = totals.expenseMinor;
          firstDate = first;
        }
        const months = firstDate ? differenceInCalendarMonths(new Date(), firstDate) + 1 : 0;
        if (!cancelled) {
          setSummary({ count, months, firstDate, averageSaving: months ? minorToMajor(Math.round((incomeMinor - expenseMinor) / months)) : 0 });
        }
      } catch (error) {
        console.error("Unable to load the account summary", error);
        if (!cancelled) setSummary(null);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isDemo, transactions, getTotalTransactionCount, getTransactionTotals, getFirstTransactionDate, recentRevision]);

  return summary;
};

/** "2 su 4 sotto controllo" for the current cycle. */
const useBudgetStatus = () => {
  const { isDemo, transactions, fetchAllTransactions } = useUnifiedTransactions();
  const { budgets, preferences } = usePlanning();
  const [rows, setRows] = useState([]);
  const hasBudgets = Object.values(budgets).some((value) => value > 0);

  useEffect(() => {
    if (!hasBudgets) { setRows([]); return undefined; }
    let cancelled = false;
    const startDay = preferences.monthStartDay || 1;
    const { startDate, endDate } = cycleRange(cycleMonthFor(new Date(), startDay), startDay);
    const load = async () => {
      try {
        const data = isDemo ? transactions : await fetchAllTransactions({ startDate, endDate });
        const stats = calculateStats(data, startDate, endDate);
        if (!cancelled) setRows(budgetRows(budgets, stats.categoryBreakdown));
      } catch {
        if (!cancelled) setRows([]);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [hasBudgets, budgets, preferences.monthStartDay, isDemo, transactions, fetchAllTransactions]);

  return rows;
};

const Profile = () => {
  const { currentUser, loading: userLoading, logout, profileName, profileNameLoading, refreshProfileName } = useAuth();
  const { loading: transactionsLoading, fetchAllTransactions } = useUnifiedTransactions();
  const { recurring, budgets, preferences, savePreferences } = usePlanning();
  const { expenseCategories, incomeCategories } = useCategories();
  const { theme, toggleTheme } = useTheme();
  const notification = useNotification();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const install = useInstallPrompt();
  const summary = useAccountSummary();
  const budgetStatus = useBudgetStatus();
  const [sheet, setSheet] = useState(null);
  const [backingUp, setBackingUp] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const loading = userLoading || transactionsLoading || profileNameLoading;
  const displayName = profileName || currentUser?.displayName || "";
  const locale = i18n.language === "en" ? enUS : it;
  const close = useCallback(() => setSheet(null), []);

  const memberSince = currentUser?.metadata?.creationTime
    ? format(new Date(currentUser.metadata.creationTime), "LLLL yyyy", { locale })
    : null;

  const activeRecurring = recurring.filter((rule) => !rule.paused);
  const fixedExpenses = minorToMajor(activeRecurring.filter((rule) => rule.type === "expense").reduce((sum, rule) => sum + monthlyEquivalentMinor(rule), 0));
  const budgetCount = Object.values(budgets).filter((value) => value > 0).length;
  const budgetsOnTrack = budgetStatus.filter((row) => row.status !== "over").length;

  const hiddenCount = preferences.hiddenCategories.length;
  const visibleCount = new Set([...expenseCategories, ...incomeCategories].map((item) => item.value)).size - hiddenCount;
  const startDay = preferences.monthStartDay || 1;

  const quickAddSummary = useMemo(() => {
    const amounts = preferences.quickAmounts.join(" · ");
    if (preferences.defaultType === "last") return t("profilePage.quickAdd.summaryLast", { amounts });
    const list = preferences.defaultType === "income" ? incomeCategories : expenseCategories;
    const category = list.find((item) => item.value === preferences.defaultCategory)?.label;
    const type = preferences.defaultType === "income" ? t("transactionModal.income") : t("transactionModal.expense");
    return [type, category, amounts].filter(Boolean).join(" · ");
  }, [preferences, incomeCategories, expenseCategories, t]);

  const backupAge = preferences.lastBackupAt ? differenceInCalendarDays(new Date(), new Date(preferences.lastBackupAt)) : null;
  const backupSubtitle = backupAge === null
    ? t("profilePage.backup.never")
    : backupAge === 0 ? t("profilePage.backup.today") : t("profilePage.backup.daysAgo", { count: backupAge });
  const backupStale = backupAge === null || backupAge > BACKUP_REMINDER_DAYS;

  const saveName = async (name) => {
    try {
      const { saveProfileName } = await import("../../services/profileService.js");
      await saveProfileName(currentUser, name);
      await refreshProfileName(currentUser);
      notification.success(t("profile.usernameSuccess"));
      return true;
    } catch (error) {
      console.error("Unable to update the name", error);
      notification.error(error.code === "permission-denied" ? t("profile.usernamePermissionError") : t("profile.usernameError"));
      return false;
    }
  };

  const backup = async () => {
    setBackingUp(true);
    try {
      const transactions = await fetchAllTransactions({ forceRefresh: true });
      const payload = buildAccountExport({ user: currentUser, profileName: displayName, transactions, recurring, budgets, preferences });
      downloadJson(payload, `soldi-sotto-backup-${new Date().toISOString().slice(0, 10)}.json`);
      await savePreferences({ lastBackupAt: Date.now() });
      notification.success(t("profile.exportSuccess"));
    } catch (error) {
      console.error("Unable to export account data", error);
      notification.error(t("profile.exportError"));
    } finally {
      setBackingUp(false);
    }
  };

  const installApp = async () => {
    if (install.canPrompt) await install.install();
    else setSheet("install");
  };

  const changeLanguage = (language) => {
    i18n.changeLanguage(language);
    writeLocalValue("appLanguage", language);
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      notification.error(t("profile.deletePasswordRequired"));
      return;
    }
    setDeleting(true);
    try {
      await deleteCurrentAccount(deletePassword);
      removeLocalValue("soldi-sotto-demo-enabled");
      navigate("/", { replace: true });
    } catch (error) {
      console.error("Unable to delete account", error);
      notification.error(error.code === "functions/failed-precondition" ? t("profile.sessionExpired") : t("profile.deleteError"));
    } finally {
      setDeletePassword("");
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="page-shell">
        <div className="h-16 animate-pulse rounded-3xl bg-muted" />
        <div className="h-48 animate-pulse rounded-3xl bg-muted" />
        <div className="h-64 animate-pulse rounded-3xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 md:space-y-6">
      <header className="mobile-glass-header flex items-center gap-2">
        <BackButton />
        <h1 className="text-[1.75rem] font-extrabold leading-tight md:text-3xl">{t("profilePage.title")}</h1>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
        <div className="space-y-6 lg:sticky lg:top-8">
          <section className="surface flex flex-col items-center gap-1.5 px-5 py-6 text-center" aria-label={t("profilePage.account")}>
            <span
              className="mb-1 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary to-hero font-display text-3xl font-extrabold text-white shadow-[0_10px_24px_hsl(var(--primary)/0.3)]"
              aria-hidden="true"
            >
              {(displayName || currentUser?.email || "?").charAt(0).toUpperCase()}
            </span>
            <button type="button" onClick={() => setSheet("name")} className="flex items-center gap-2 rounded-xl px-2 font-display text-2xl font-extrabold hover:bg-muted/60">
              {displayName || t("profile.user")}
              <FiEdit2 className="h-4 w-4 text-primary" aria-label={t("profilePage.name.title")} />
            </button>
            <p className="max-w-full truncate text-sm text-muted-foreground">
              {currentUser?.email}
              {currentUser?.emailVerified && <span className="ml-1.5 font-semibold text-income">· {t("profilePage.verified")}</span>}
            </p>
            {memberSince && <p className="text-[13px] text-muted-foreground/80">{t("profilePage.memberSince", { date: memberSince })}</p>}

            <dl className="mt-4 grid w-full grid-cols-3 border-t border-border pt-4" aria-label={t("profilePage.summary")}>
              {[
                { label: t("profilePage.movements"), value: summary ? summary.count.toLocaleString(i18n.language) : "–" },
                { label: t("profilePage.months"), value: summary ? summary.months : "–" },
                {
                  label: t("profilePage.averageSaving"),
                  value: summary ? formatSignedAmount(Math.abs(summary.averageSaving), summary.averageSaving >= 0 ? "income" : "expense").replace(/,\d\d(?=\s|$)/, "") : "–",
                  tone: summary && summary.averageSaving >= 0 ? "text-income" : "",
                },
              ].map((item, index) => (
                <div key={item.label} className={cn("flex flex-col gap-0.5 px-1", index < 2 && "border-r border-border")}>
                  <dd className={cn("amount text-xl", item.tone)}>{item.value}</dd>
                  <dt className="text-xs font-semibold text-muted-foreground">{item.label}</dt>
                </div>
              ))}
            </dl>
          </section>

          <SettingsGroup title={t("budgets.planning")}>
            <SettingsRow
              icon={FiRepeat}
              tone="blue"
              title={t("recurring.title")}
              subtitle={activeRecurring.length
                ? t("profilePage.recurringSummary", { count: activeRecurring.length, amount: compactCurrency(fixedExpenses) })
                : t("profilePage.recurringEmpty")}
              to="/recurring"
            />
            <SettingsRow
              icon={FiTarget}
              tone="amber"
              title={t("budgets.title")}
              subtitle={budgetCount
                ? t("profilePage.budgetSummary", { onTrack: budgetsOnTrack, count: budgetCount })
                : t("profilePage.budgetEmpty")}
              to="/budgets"
            />
          </SettingsGroup>

          <Button variant="outline" size="lg" onClick={handleLogout} className="hidden w-full text-warning-strong hover:text-warning-strong lg:flex">
            {t("navbar.logout")}
          </Button>
        </div>

        <div className="space-y-6">
          <SettingsGroup title={t("profilePage.preferences")}>
            <SettingsRow
              icon={FiMoon}
              title={t("profile.theme")}
              trailing={(
                <InlineSegmented
                  label={t("profile.theme")}
                  value={theme}
                  onChange={toggleTheme}
                  options={[
                    { value: "light", label: t("profile.themeLight") },
                    { value: "dark", label: t("profile.themeDark") },
                    { value: "system", label: t("profile.themeSystem") },
                  ]}
                />
              )}
            />
            <SettingsRow
              icon={FiGlobe}
              title={t("profile.language")}
              trailing={(
                <InlineSegmented
                  label={t("profile.language")}
                  value={i18n.language?.startsWith("en") ? "en" : "it"}
                  onChange={changeLanguage}
                  options={[{ value: "it", label: "Italiano" }, { value: "en", label: "English" }]}
                />
              )}
            />
            <SettingsRow
              icon={FiCalendar}
              tone="blue"
              title={t("profilePage.monthStart.title")}
              subtitle={startDay > 1 ? t("profilePage.monthStart.summaryPayday", { day: startDay }) : t("profilePage.monthStart.summaryCalendar")}
              onClick={() => setSheet("monthStart")}
              testId="row-month-start"
            />
            <SettingsRow icon={FiPlusCircle} title={t("profilePage.quickAdd.title")} subtitle={quickAddSummary} onClick={() => setSheet("quickAdd")} />
            <SettingsRow
              icon={FiGrid}
              title={t("profilePage.categories.title")}
              subtitle={t("profilePage.categories.summary", { visible: visibleCount, hidden: hiddenCount })}
              onClick={() => setSheet("categories")}
            />
          </SettingsGroup>

          <SettingsGroup title={t("profilePage.data")}>
            <SettingsRow icon={FiDownload} tone="green" title={t("profilePage.export.title")} subtitle={t("profilePage.export.summary")} onClick={() => setSheet("export")} />
            <SettingsRow
              icon={FiDatabase}
              tone="amber"
              title={backingUp ? t("profile.exporting") : t("profilePage.backup.title")}
              subtitle={backupStale ? `${backupSubtitle} · ${t("profilePage.backup.remind")}` : backupSubtitle}
              subtitleTone={backupStale ? "warning" : undefined}
              onClick={backingUp ? undefined : backup}
            />
            {(install.canPrompt || install.needsManualSteps) && (
              <SettingsRow icon={FiSmartphone} title={t("profilePage.install.title")} subtitle={t("profilePage.install.summary")} onClick={installApp} />
            )}
          </SettingsGroup>

          <SettingsGroup title={t("profilePage.security")}>
            <SettingsRow icon={FiKey} title={t("profilePage.password.title")} subtitle={t("profilePage.password.summary")} onClick={() => setSheet("password")} />
            <SettingsRow icon={FiMail} title={t("profilePage.email.title")} subtitle={currentUser?.email} onClick={() => setSheet("email")} />
            {ACCOUNT_DELETION_ENABLED && (
              <SettingsRow icon={FiTrash2} title={t("profile.deleteAccountTitle")} subtitle={t("profile.deleteAccountDescription")} onClick={() => setSheet("delete")} />
            )}
          </SettingsGroup>

          <div className="space-y-3 pb-4 lg:hidden">
            <Button variant="outline" size="lg" onClick={handleLogout} className="w-full text-warning-strong hover:text-warning-strong">
              {t("navbar.logout")}
            </Button>
          </div>
          <p className="flex justify-center gap-3 text-xs text-muted-foreground">
            <FiLock className="h-3.5 w-3.5" aria-hidden="true" />
            <Link to="/privacy" className="hover:underline">Privacy</Link>
            <span aria-hidden="true">·</span>
            <Link to="/terms" className="hover:underline">{t("profilePage.terms")}</Link>
          </p>
        </div>
      </div>

      <NameSheet open={sheet === "name"} onClose={close} currentName={displayName} onSave={saveName} />
      <EmailSheet open={sheet === "email"} onClose={close} />
      <PasswordSheet open={sheet === "password"} onClose={close} />
      <MonthStartSheet open={sheet === "monthStart"} onClose={close} />
      <QuickAddSheet open={sheet === "quickAdd"} onClose={close} />
      <CategoriesSheet open={sheet === "categories"} onClose={close} />
      <ExportSheet open={sheet === "export"} onClose={close} firstDate={summary?.firstDate || undefined} />
      <InstallSheet open={sheet === "install"} onClose={close} />
      {ACCOUNT_DELETION_ENABLED && (
        <Sheet
          open={sheet === "delete"}
          onOpenChange={(next) => !next && close()}
          title={t("profile.deleteAccountTitle")}
          description={t("profile.deleteAccountHelp")}
          footer={<Button variant="destructive" size="lg" className="w-full" onClick={handleDeleteAccount} disabled={deleting}>{deleting ? t("profile.deleting") : t("profile.deleteAccountButton")}</Button>}
        >
          <div className="space-y-2">
            <Label htmlFor="delete-password">{t("profile.currentPassword")}</Label>
            <Input id="delete-password" type="password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} autoComplete="current-password" />
          </div>
        </Sheet>
      )}
    </div>
  );
};

export default React.memo(Profile);
