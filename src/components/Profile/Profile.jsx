import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { differenceInCalendarDays, differenceInCalendarMonths, format } from "date-fns";
import { enUS, it } from "date-fns/locale";
import {
  FiBell, FiCalendar, FiDatabase, FiDownload, FiEdit2, FiEyeOff, FiGlobe, FiGrid, FiKey, FiLock, FiMail, FiMessageSquare, FiMoon, FiPlusCircle,
  FiRepeat, FiShield, FiSmartphone, FiTarget, FiTrash2, FiUpload,
} from "react-icons/fi";
import { useAuth } from "../../context/AuthProvider.jsx";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";
import { usePlanning } from "../../context/PlanningProvider.jsx";
import { usePrivacy } from "../../context/PrivacyProvider.jsx";
import { useTheme } from "../../utils/ThemeProvider";
import { useNotification } from "../../utils/notificationUtils";
import { Link, useNavigate } from "../../router/RouterProvider";
import { APP_NAME } from "../../utils/brand.js";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import Sheet from "../ui/sheet";
import Switch from "../ui/switch";
import { SettingsGroup, SettingsRow, InlineSegmented } from "./SettingsList.jsx";
import { CategoriesSheet, CurrencySheet, DownloadAppSheet, EmailSheet, ExportSheet, InstallSheet, MonthStartSheet, NameSheet, PasswordSheet, QuickAddSheet } from "./ProfileSheets.jsx";
import { currencySymbol } from "../../utils/currency.js";
import { currencyName } from "../../utils/currencyRegions.js";
import { useAccountCurrency } from "../../hooks/useAccountCurrency.js";
import UpdateChecker from "../Update/UpdateChecker";
import { downloadJson } from "../../utils/accountExport.js";
import { deleteCurrentAccount } from "../../services/accountService.js";
import { currentVault } from "../../services/vaultSession.js";
import { removeLocalValue } from "../../utils/storage.js";
import { loadEnglish } from "../../utils/loadEnglish.js";
import { useAppDownloads } from "../../utils/appDownloads.js";
import { useInstallPrompt } from "../../utils/installPrompt.js";
import { useCategories } from "../../utils/categories.jsx";
import { calculateStats } from "../../utils/statsUtils.jsx";
import { budgetRows } from "../../utils/budgets.js";
import { monthlyEquivalentMinor } from "../../utils/recurrence.js";
import { cycleMonthFor, cycleRange } from "../../utils/monthCycle.js";
import formatCurrency, { formatCompactCurrency, formatSignedCompact, moneyLocale } from "../../utils/formatCurrency.jsx";
import { minorToMajor } from "../../utils/money.js";
import { cn } from "../../lib/utils.js";
import { APP_VERSION } from "../../utils/appVersion";
import { buildFeedbackMailto } from "../../utils/feedback.js";
import { openExternal } from "../../utils/openExternal.js";
import { hapticTap } from "../../platform/haptics.js";
import { isMobile } from "../../platform/index.js";
import {
  clearRecurringReminders,
  isRecurringRemindersEnabled,
  requestReminderPermission,
  setRecurringRemindersEnabled,
  syncRecurringReminders,
} from "../../platform/reminders.js";

// Enable only after deploying the database migration that enforces reauthentication.
// Account deletion is required by the App Store (5.1.1(v)) for any app that
// lets people create an account, so it is on unless it is explicitly disabled.
const ACCOUNT_DELETION_ENABLED = import.meta.env.VITE_ENABLE_ACCOUNT_DELETION !== "false";

/** The account currency's symbol, drawn where the other rows have an icon. */
const CurrencyGlyph = ({ className }) => {
  const { i18n } = useTranslation();
  const currency = useAccountCurrency();
  const symbol = currencySymbol(currency, moneyLocale(i18n.language));
  return (
    <span className={cn(className, "flex items-center justify-center font-display font-extrabold leading-none", symbol.length > 1 ? "whitespace-nowrap text-[10px]" : "text-[16px]")}>
      {symbol}
    </span>
  );
};

CurrencyGlyph.propTypes = { className: PropTypes.string };
const ApproveDeviceSheet = lazy(() => import("./ApproveDeviceSheet.jsx"));
const RestoreBackupSheet = lazy(() => import("./RestoreBackupSheet.jsx"));
const ImportCsvSheet = lazy(() => import("./ImportCsvSheet.jsx"));
const BACKUP_REMINDER_DAYS = 30;

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
  const { loading: transactionsLoading } = useUnifiedTransactions();
  const { recurring, budgets, preferences, savePreferences } = usePlanning();
  const {
    hideAmounts,
    toggleHideAmounts,
    biometricAvailable,
    biometricType,
    biometricEnabled,
    systemAppLock,
    enableBiometricLock,
    disableBiometricLock,
  } = usePrivacy();
  const { expenseCategories, incomeCategories } = useCategories();
  const { theme, toggleTheme } = useTheme();
  const notification = useNotification();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const install = useInstallPrompt();
  const summary = useAccountSummary();
  const budgetStatus = useBudgetStatus();
  const [sheet, setSheet] = useState(null);
  const downloads = useAppDownloads();
  const [backingUp, setBackingUp] = useState(false);
  const [togglingBiometric, setTogglingBiometric] = useState(false);
  const showRemindersToggle = isMobile();
  const [remindersEnabled, setRemindersEnabled] = useState(() => isRecurringRemindersEnabled());
  const [togglingReminders, setTogglingReminders] = useState(false);
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
      const { BackupService } = await import("../../services/backupService.js");
      const payload = await BackupService.fetch(currentUser, displayName);
      const saved = await downloadJson(payload, `ducat-backup-${new Date().toISOString().slice(0, 10)}.json`);
      if (!saved) return;
      await savePreferences({ lastBackupAt: Date.now() });
    } catch (error) {
      console.error("Unable to export account data", error);
      notification.error(t("profile.exportError"), {
        action: { label: t("notifications.retry"), onClick: backup },
      });
    } finally {
      setBackingUp(false);
    }
  };

  const installApp = async () => {
    if (install.canPrompt) await install.install();
    else setSheet("install");
  };

  const changeLanguage = async (language) => {
    // English is a separate chunk: load it before switching (i18n persists it).
    if (String(language).toLowerCase().startsWith("en")) await loadEnglish(i18n);
    await i18n.changeLanguage(language);
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const handleToggleReminders = async () => {
    if (togglingReminders) return;
    hapticTap();
    setTogglingReminders(true);
    try {
      if (remindersEnabled) {
        await clearRecurringReminders();
        setRemindersEnabled(false);
        return;
      }
      const granted = await requestReminderPermission();
      if (!granted) {
        notification.error(t("reminders.denied"));
        return;
      }
      setRecurringRemindersEnabled(true);
      setRemindersEnabled(true);
      await syncRecurringReminders(recurring, {
        formatTitle: (rule) => t("reminders.notifTitle", { description: rule.description }),
        formatBody: (_rule, amount, isDayBefore) => t(
          isDayBefore ? "reminders.notifBodyTomorrow" : "reminders.notifBodyToday",
          { amount: formatCurrency(amount, moneyLocale(i18n.language)) }
        ),
      });
    } finally {
      setTogglingReminders(false);
    }
  };

  const biometricLabel = t(
    biometricType === "touchID"
      ? "privacy.biometric.touchId"
      : biometricType === "faceID"
        ? "privacy.biometric.faceId"
        : "privacy.biometric.device"
  );

  const handleToggleBiometric = async () => {
    if (togglingBiometric) return;
    hapticTap();
    setTogglingBiometric(true);
    try {
      const reason = t("privacy.biometric.promptReason", { app: APP_NAME });
      if (biometricEnabled) await disableBiometricLock(reason);
      else await enableBiometricLock(reason);
    } finally {
      setTogglingBiometric(false);
    }
  };

  const handleFeedback = async () => {
    hapticTap();
    try {
      await openExternal(buildFeedbackMailto({
        language: i18n.language,
        subjectPrefix: t("profilePage.feedback.subject"),
        promptLine: t("profilePage.feedback.bodyPrompt"),
      }));
    } catch {
      notification.error(t("error"));
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      notification.error(t("profile.deletePasswordRequired"));
      return;
    }
    setDeleting(true);
    try {
      await deleteCurrentAccount(deletePassword);
      removeLocalValue("ducat-demo-enabled");
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

            <div className="profile-summary mt-4 w-full border-t border-border pt-4">
              <dl className="profile-summary-list" aria-label={t("profilePage.summary")}>
                {[
                  { label: t("profilePage.movements"), value: summary ? summary.count.toLocaleString(i18n.language) : "–", mask: false },
                  { label: t("profilePage.months"), value: summary ? summary.months : "–", mask: false },
                  {
                    label: t("profilePage.averageSaving"),
                    value: summary ? formatSignedCompact(Math.abs(summary.averageSaving), summary.averageSaving >= 0 ? "income" : "expense", i18n.language) : "–",
                    tone: summary && summary.averageSaving >= 0 ? "text-income" : "",
                    mask: true,
                  },
                ].map((item) => (
                  <div key={item.label} className="profile-summary-item">
                    <dd className={cn(
                      "min-w-0 overflow-x-auto whitespace-nowrap text-xl",
                      item.mask ? "amount" : "font-display font-bold tabular-nums tracking-[-0.01em]",
                      item.tone
                    )}>{item.value}</dd>
                    <dt className="text-xs font-semibold text-muted-foreground">{item.label}</dt>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <SettingsGroup title={t("budgets.planning")}>
            <SettingsRow
              icon={FiRepeat}
              tone="blue"
              title={t("recurring.title")}
              subtitle={activeRecurring.length
                ? t("profilePage.recurringSummary", { count: activeRecurring.length, amount: formatCompactCurrency(fixedExpenses, i18n.language) })
                : t("profilePage.recurringEmpty")}
              subtitleMask={activeRecurring.length > 0}
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
              icon={CurrencyGlyph}
              tone="green"
              title={t("profilePage.currency.title")}
              subtitle={`${currencyName(preferences.currency, i18n.language?.startsWith("en") ? "en" : "it")} · ${preferences.currency}`}
              onClick={() => setSheet("currency")}
              testId="row-currency"
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
            <SettingsRow
              icon={FiEyeOff}
              title={t("privacy.modeTitle")}
              subtitle={t("privacy.modeSummary")}
              testId="row-privacy-mode"
              trailing={(
                <Switch
                  checked={hideAmounts}
                  aria-label={t("privacy.modeTitle")}
                  onCheckedChange={() => {
                    hapticTap();
                    toggleHideAmounts();
                  }}
                />
              )}
            />
            {showRemindersToggle && (
              <SettingsRow
                icon={FiBell}
                tone="blue"
                title={t("reminders.title")}
                subtitle={t("reminders.summary")}
                testId="row-recurring-reminders"
                trailing={(
                  <Switch
                    checked={remindersEnabled}
                    disabled={togglingReminders}
                    aria-label={t("reminders.title")}
                    onCheckedChange={handleToggleReminders}
                  />
                )}
              />
            )}
          </SettingsGroup>

          <SettingsGroup title={t("profilePage.data")}>
            <SettingsRow icon={FiDownload} tone="green" title={t("profilePage.export.title")} subtitle={t("profilePage.export.summary")} onClick={() => setSheet("export")} />
            <SettingsRow icon={FiUpload} tone="green" title={t("csvImport.title")} subtitle={t("csvImport.summary")} onClick={() => setSheet("importCsv")} testId="row-import-csv" />
            <SettingsRow
              icon={FiDatabase}
              tone="amber"
              title={backingUp ? t("profile.exporting") : t("profilePage.backup.title")}
              subtitle={backupStale ? `${backupSubtitle} · ${t("profilePage.backup.remind")}` : backupSubtitle}
              subtitleTone={backupStale ? "warning" : undefined}
              onClick={backingUp ? undefined : backup}
            />
            <SettingsRow icon={FiUpload} tone="blue" title={t("backupRestore.title")} subtitle={t("backupRestore.rowSummary")} onClick={() => setSheet("restore")} />
            <UpdateChecker />
            {downloads.available && (
              <SettingsRow
                icon={FiDownload}
                tone="blue"
                title={downloads.primary
                  ? t("profilePage.downloadApp.titleFor", { device: t(`landing.download.${downloads.primary.platform}.title`) })
                  : t("profilePage.downloadApp.title")}
                subtitle={downloads.primary
                  ? t(`profilePage.downloadApp.summary${downloads.primary.platform.charAt(0).toUpperCase()}${downloads.primary.platform.slice(1)}`)
                  : t("profilePage.downloadApp.summary")}
                onClick={() => setSheet("downloadApp")}
                testId="row-download-app"
              />
            )}
            {(install.canPrompt || install.needsManualSteps) && (
              <SettingsRow icon={FiSmartphone} title={t("profilePage.install.title")} subtitle={t("profilePage.install.summary")} onClick={installApp} />
            )}
            <SettingsRow
              icon={FiMessageSquare}
              title={t("profilePage.feedback.title")}
              subtitle={t("profilePage.feedback.summary")}
              onClick={handleFeedback}
              testId="row-feedback"
            />
          </SettingsGroup>

          <SettingsGroup title={t("profilePage.security")}>
            {currentUser?.emailVerified && currentVault(currentUser.uid)?.canPair() && (
              <SettingsRow icon={FiSmartphone} title={t("pairing.approve")} onClick={() => setSheet("approveDevice")} />
            )}
            {/* iOS 18+ locks apps itself: point there instead of a second lock.
                Anyone who already turned the in-app lock on keeps its switch. */}
            {biometricAvailable && systemAppLock && !biometricEnabled && (
              <SettingsRow
                icon={FiShield}
                tone="blue"
                title={t("privacy.biometric.title", { method: biometricLabel })}
                subtitle={t("privacy.biometric.systemHint", { app: APP_NAME, method: biometricLabel })}
                subtitleWrap
                testId="row-system-app-lock"
              />
            )}
            {biometricAvailable && (!systemAppLock || biometricEnabled) && (
              <SettingsRow
                icon={FiShield}
                tone="blue"
                title={t("privacy.biometric.title", { method: biometricLabel })}
                subtitle={t("privacy.biometric.summary")}
                testId="row-biometric-lock"
                trailing={(
                  <Switch
                    checked={biometricEnabled}
                    disabled={togglingBiometric}
                    aria-label={t("privacy.biometric.title", { method: biometricLabel })}
                    onCheckedChange={handleToggleBiometric}
                  />
                )}
              />
            )}
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
          <p className="text-center text-xs text-muted-foreground/60" data-testid="app-version">
            {APP_NAME} · v{APP_VERSION}
          </p>
        </div>
      </div>

      <NameSheet open={sheet === "name"} onClose={close} currentName={displayName} onSave={saveName} />
      <EmailSheet open={sheet === "email"} onClose={close} />
      <PasswordSheet open={sheet === "password"} onClose={close} />
      <MonthStartSheet open={sheet === "monthStart"} onClose={close} />
      <CurrencySheet open={sheet === "currency"} onClose={close} />
      <QuickAddSheet open={sheet === "quickAdd"} onClose={close} />
      <CategoriesSheet open={sheet === "categories"} onClose={close} />
      <ExportSheet open={sheet === "export"} onClose={close} firstDate={summary?.firstDate || undefined} />
      <InstallSheet open={sheet === "install"} onClose={close} />
      {downloads.available && (
        <DownloadAppSheet open={sheet === "downloadApp"} onClose={close} downloads={downloads} />
      )}
      {sheet === "approveDevice" && <Suspense fallback={null}><ApproveDeviceSheet uid={currentUser.uid} onClose={close} /></Suspense>}
      {sheet === "restore" && <Suspense fallback={null}><RestoreBackupSheet onClose={close} /></Suspense>}
      {sheet === "importCsv" && <Suspense fallback={null}><ImportCsvSheet onClose={close} /></Suspense>}
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

export default Profile;
