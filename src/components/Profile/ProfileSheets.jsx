import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { Reorder, useDragControls } from "framer-motion";
import { FiMenu } from "react-icons/fi";
import { endOfDay, subMonths } from "date-fns";
import Sheet from "../ui/sheet";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { cn } from "../../lib/utils";
import { useAuth } from "../../context/AuthProvider.jsx";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";
import { usePlanning } from "../../context/PlanningProvider.jsx";
import { useCategories } from "../../utils/categories.jsx";
import { useNotification } from "../../utils/notificationUtils.jsx";
import { cycleMonthFor, cycleRange, suggestMonthStartDay } from "../../utils/monthCycle.js";
import { formatCycleRange } from "../../utils/monthLabel.js";
import { exportAnalyticsCsv, exportAnalyticsPdf } from "../../utils/analyticsExport.js";
import { dateToDateKey } from "../../utils/dateUtils.js";
import { requestEmailChange, requestPasswordReset } from "../../services/accountService.js";
import { DEFAULT_QUICK_AMOUNTS } from "../../schemas/planning.js";

const SegmentedField = ({ label, options, value, onChange }) => (
  <div role="radiogroup" aria-label={label} className="segmented" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
    {options.map((option) => (
      <button key={option.value} type="button" role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)}>
        {option.label}
      </button>
    ))}
  </div>
);

SegmentedField.propTypes = {
  label: PropTypes.string.isRequired,
  options: PropTypes.array.isRequired,
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
};

/* ── Name ──────────────────────────────────────────────────────────────── */
export const NameSheet = ({ open, onClose, currentName, onSave }) => {
  const { t } = useTranslation();
  const [value, setValue] = useState(currentName || "");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setValue(currentName || ""); }, [open, currentName]);
  const trimmed = value.trim();
  const valid = trimmed.length >= 3 && trimmed.length <= 50;

  const submit = async (event) => {
    event.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      if (await onSave(trimmed)) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t("profilePage.name.title")}
      description={t("profilePage.name.hint")}
      footer={<Button type="submit" form="name-form" size="lg" className="w-full" disabled={!valid || saving || trimmed === currentName}>{saving ? t("profile.updating") : t("save")}</Button>}
    >
      <form id="name-form" onSubmit={submit} className="space-y-2">
        <Label htmlFor="profile-name">{t("profilePage.name.label")}</Label>
        <Input id="profile-name" value={value} onChange={(event) => setValue(event.target.value)} maxLength={50} autoComplete="nickname" autoFocus />
      </form>
    </Sheet>
  );
};

NameSheet.propTypes = { open: PropTypes.bool.isRequired, onClose: PropTypes.func.isRequired, currentName: PropTypes.string, onSave: PropTypes.func.isRequired };

/* ── Email ─────────────────────────────────────────────────────────────── */
export const EmailSheet = ({ open, onClose }) => {
  const { t } = useTranslation();
  const notification = useNotification();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setEmail(""); setPassword(""); } }, [open]);

  const submit = async (event) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      notification.error(t("profile.emailFieldsRequired"));
      return;
    }
    setSaving(true);
    try {
      await requestEmailChange(email, password);
      notification.success(t("profile.emailChangeSuccess"));
      onClose();
    } catch (error) {
      console.error("Unable to request email change", error);
      notification.error(error.code === "auth/invalid-credential" ? t("profile.invalidPassword") : t("profile.emailChangeError"));
    } finally {
      setSaving(false);
      setPassword("");
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t("profilePage.email.title")}
      description={t("profilePage.email.hint")}
      footer={<Button type="submit" form="email-form" size="lg" className="w-full" disabled={saving}>{saving ? t("profile.sendingVerification") : t("profile.changeEmail")}</Button>}
    >
      <form id="email-form" onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="profile-new-email">{t("profile.newEmail")}</Label>
          <Input id="profile-new-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" maxLength={254} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-current-password">{t("profile.currentPassword")}</Label>
          <Input id="profile-current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
        </div>
      </form>
    </Sheet>
  );
};

EmailSheet.propTypes = { open: PropTypes.bool.isRequired, onClose: PropTypes.func.isRequired };

/* ── Password ──────────────────────────────────────────────────────────── */
export const PasswordSheet = ({ open, onClose }) => {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const notification = useNotification();
  const [sending, setSending] = useState(false);
  const send = async () => {
    setSending(true);
    try {
      await requestPasswordReset();
      notification.success(t("profile.passwordResetSuccess"));
      onClose();
    } catch (error) {
      console.error("Unable to request password reset", error);
      notification.error(t("profile.passwordResetError"));
    } finally {
      setSending(false);
    }
  };
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t("profilePage.password.title")}
      description={t("profilePage.password.hint", { email: currentUser?.email || "" })}
      footer={<Button size="lg" className="w-full" onClick={send} disabled={sending}>{sending ? t("profile.sending") : t("profilePage.password.send")}</Button>}
    />
  );
};

PasswordSheet.propTypes = { open: PropTypes.bool.isRequired, onClose: PropTypes.func.isRequired };

/* ── Month start ───────────────────────────────────────────────────────── */
export const MonthStartSheet = ({ open, onClose }) => {
  const { t, i18n } = useTranslation();
  const { isDemo, transactions, fetchAllTransactions } = useUnifiedTransactions();
  const { preferences, ready, savePreferences } = usePlanning();
  const [mode, setMode] = useState("calendar");
  const [day, setDay] = useState(27);
  const [suggested, setSuggested] = useState(null);

  useEffect(() => {
    if (!open) return;
    const stored = preferences.monthStartDay || 1;
    setMode(stored > 1 ? "payday" : "calendar");
    setDay(stored > 1 ? stored : 27);
  }, [open, preferences.monthStartDay]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const data = isDemo ? transactions : await fetchAllTransactions({ startDate: subMonths(new Date(), 6), endDate: new Date() });
        if (!cancelled) setSuggested(suggestMonthStartDay(data));
      } catch {
        if (!cancelled) setSuggested(null);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [open, isDemo, transactions, fetchAllTransactions]);

  const effectiveDay = mode === "payday" ? day : 1;
  const preview = useMemo(() => {
    const month = cycleMonthFor(new Date(), effectiveDay);
    return cycleRange(month, effectiveDay);
  }, [effectiveDay]);

  const save = async () => {
    if (await savePreferences({ monthStartDay: effectiveDay })) onClose();
  };

  const step = (delta) => setDay((value) => Math.min(31, Math.max(2, value + delta)));

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t("profilePage.monthStart.title")}
      description={t("profilePage.monthStart.hint")}
      footer={<Button size="lg" className="w-full" onClick={save} disabled={!ready}>{t("save")}</Button>}
    >
      <div role="radiogroup" aria-label={t("profilePage.monthStart.title")} className="space-y-2">
        {[
          { value: "calendar", title: t("profilePage.monthStart.calendar"), hint: t("profilePage.monthStart.calendarHint") },
          { value: "payday", title: t("profilePage.monthStart.payday"), hint: t("profilePage.monthStart.paydayHint") },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={mode === option.value}
            onClick={() => setMode(option.value)}
            className={cn(
              "flex w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left transition-colors",
              mode === option.value ? "border-primary ring-1 ring-primary" : "border-border hover:bg-muted/50"
            )}
          >
            <span className={cn("h-5 w-5 shrink-0 rounded-full border-2", mode === option.value ? "border-[6px] border-primary" : "border-input")} aria-hidden="true" />
            <span className="flex flex-col">
              <span className="text-[15px] font-semibold">{option.title}</span>
              <span className="text-[13px] text-muted-foreground">{option.hint}</span>
            </span>
          </button>
        ))}
      </div>

      {mode === "payday" && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3">
          <span className="text-[15px] font-semibold">{t("profilePage.monthStart.dayLabel")}</span>
          <span className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => step(-1)} aria-label={t("profilePage.monthStart.earlier")}>−</Button>
            <output className="amount w-9 text-center text-xl" aria-live="polite" data-testid="month-start-day">{day}</output>
            <Button variant="outline" size="icon" onClick={() => step(1)} aria-label={t("profilePage.monthStart.later")}>+</Button>
          </span>
        </div>
      )}

      {suggested && !(mode === "payday" && day === suggested) && (
        <button
          type="button"
          onClick={() => { setMode("payday"); setDay(suggested); }}
          className="flex w-full flex-wrap items-baseline gap-x-2 rounded-xl bg-accent px-3 py-2.5 text-left text-[13px] text-accent-foreground"
        >
          <span className="font-bold">{t("transactionModal.suggested")}</span>
          <span className="text-foreground/80">{t("profilePage.monthStart.suggestion", { day: suggested })}</span>
        </button>
      )}

      <div className="space-y-1 rounded-2xl bg-card p-4">
        <p className="text-xs font-extrabold uppercase tracking-[0.06em] text-muted-foreground">{t("profilePage.monthStart.preview")}</p>
        <p className="font-display text-xl font-bold" data-testid="month-start-preview">{formatCycleRange(preview.startDate, preview.endDate, i18n.language)}</p>
        <p className="text-[13px] text-muted-foreground">{t("profilePage.monthStart.previewHint")}</p>
      </div>
    </Sheet>
  );
};

MonthStartSheet.propTypes = { open: PropTypes.bool.isRequired, onClose: PropTypes.func.isRequired };

/* ── Quick add defaults ────────────────────────────────────────────────── */
export const QuickAddSheet = ({ open, onClose }) => {
  const { t } = useTranslation();
  const { preferences, ready, savePreferences } = usePlanning();
  const { visibleExpenseCategories, visibleIncomeCategories } = useCategories();
  const [type, setType] = useState("last");
  const [category, setCategory] = useState("");
  const [amounts, setAmounts] = useState([]);

  useEffect(() => {
    if (!open) return;
    setType(preferences.defaultType);
    setCategory(preferences.defaultCategory || "");
    setAmounts(preferences.quickAmounts.map(String));
  }, [open, preferences]);

  const categories = type === "income" ? visibleIncomeCategories : visibleExpenseCategories;
  useEffect(() => {
    if (type !== "last" && !categories.some((item) => item.value === category)) setCategory(categories[0]?.value || "");
  }, [type, categories, category]);

  const save = async () => {
    const quickAmounts = [...new Set(amounts.map((value) => parseInt(value, 10)).filter((value) => value > 0 && value <= 100000))];
    const ok = await savePreferences({
      defaultType: type,
      defaultCategory: type === "last" ? null : category || null,
      quickAmounts: quickAmounts.length ? quickAmounts : [...DEFAULT_QUICK_AMOUNTS],
    });
    if (ok) onClose();
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t("profilePage.quickAdd.title")}
      description={t("profilePage.quickAdd.hint")}
      footer={<Button size="lg" className="w-full" onClick={save} disabled={!ready}>{t("save")}</Button>}
    >
      <div className="space-y-2">
        <p className="text-sm font-bold">{t("profilePage.quickAdd.startWith")}</p>
        <SegmentedField
          label={t("profilePage.quickAdd.startWith")}
          value={type}
          onChange={setType}
          options={[
            { value: "last", label: t("profilePage.quickAdd.last") },
            { value: "expense", label: t("transactionModal.expense") },
            { value: "income", label: t("transactionModal.income") },
          ]}
        />
      </div>
      {type !== "last" && (
        <div className="space-y-2">
          <Label htmlFor="quick-add-category">{t("transactionModal.category")}</Label>
          <select
            id="quick-add-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base md:text-sm"
          >
            {categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
      )}
      <div className="space-y-2">
        <p className="text-sm font-bold">{t("profilePage.quickAdd.amounts")}</p>
        <div className="grid grid-cols-5 gap-2">
          {[0, 1, 2, 3, 4].map((index) => (
            <Input
              key={index}
              inputMode="numeric"
              aria-label={t("profilePage.quickAdd.amountLabel", { index: index + 1 })}
              value={amounts[index] || ""}
              onChange={(event) => setAmounts((current) => {
                const next = [...current];
                next[index] = event.target.value.replace(/\D/g, "").slice(0, 6);
                return next;
              })}
              className="h-11 px-2 text-center tabular-nums"
            />
          ))}
        </div>
        <p className="text-[13px] text-muted-foreground">{t("profilePage.quickAdd.amountsHint")}</p>
      </div>
    </Sheet>
  );
};

QuickAddSheet.propTypes = { open: PropTypes.bool.isRequired, onClose: PropTypes.func.isRequired };

/* ── Categories ────────────────────────────────────────────────────────── */
const CategoryItem = ({ item, hidden, count, onToggle, t }) => {
  const controls = useDragControls();
  const locked = item.value === "altro";
  return (
    <Reorder.Item
      value={item.value}
      dragListener={false}
      dragControls={controls}
      className={cn("flex items-center gap-3 bg-card px-3 py-2.5", hidden && "opacity-60")}
    >
      <button
        type="button"
        onPointerDown={(event) => !locked && controls.start(event)}
        className={cn("flex h-9 w-7 shrink-0 touch-none items-center justify-center text-muted-foreground", locked ? "invisible" : "cursor-grab")}
        aria-label={t("profilePage.categories.drag", { category: item.label })}
        tabIndex={-1}
      >
        <FiMenu className="h-4 w-4" aria-hidden="true" />
      </button>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-semibold">{item.label}</span>
        {count !== undefined && (
          <span className="text-xs text-muted-foreground">
            {count ? t("profilePage.categories.count", { count }) : t("profilePage.categories.unused")}
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={!hidden}
        aria-label={t("profilePage.categories.show", { category: item.label })}
        disabled={locked}
        onClick={() => onToggle(item.value)}
        className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40", hidden ? "bg-input" : "bg-primary")}
      >
        <span aria-hidden="true" className={cn("absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-[left]", hidden ? "left-[3px]" : "left-[23px]")} />
      </button>
    </Reorder.Item>
  );
};

CategoryItem.propTypes = {
  item: PropTypes.shape({ value: PropTypes.string, label: PropTypes.string }).isRequired,
  hidden: PropTypes.bool,
  count: PropTypes.number,
  onToggle: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
};

export const CategoriesSheet = ({ open, onClose }) => {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const { isDemo, transactions } = useUnifiedTransactions();
  const { preferences, ready, savePreferences } = usePlanning();
  const { expenseCategories, incomeCategories } = useCategories();
  const [type, setType] = useState("expense");
  const [order, setOrder] = useState({ expense: [], income: [] });
  const [hidden, setHidden] = useState(new Set());
  const [counts, setCounts] = useState({});

  useEffect(() => {
    if (!open) return;
    setOrder({ expense: expenseCategories.map((item) => item.value), income: incomeCategories.map((item) => item.value) });
    setHidden(new Set(preferences.hiddenCategories));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const values = [...new Set([...expenseCategories, ...incomeCategories].map((item) => item.value))];
    const load = async () => {
      try {
        if (isDemo) {
          const result = {};
          transactions.forEach((item) => { result[item.category] = (result[item.category] || 0) + 1; });
          if (!cancelled) setCounts(Object.fromEntries(values.map((value) => [value, result[value] || 0])));
        } else if (currentUser) {
          const { TransactionService } = await import("../../services/transactionService.jsx");
          const result = await TransactionService.countByCategory(currentUser.uid, values);
          if (!cancelled) setCounts(result);
        }
      } catch {
        if (!cancelled) setCounts({});
      }
    };
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const byValue = useMemo(() => new Map([...expenseCategories, ...incomeCategories].map((item) => [item.value, item])), [expenseCategories, incomeCategories]);
  const list = order[type].map((value) => byValue.get(value)).filter(Boolean);

  const toggle = (value) => setHidden((current) => {
    const next = new Set(current);
    if (next.has(value)) next.delete(value); else next.add(value);
    return next;
  });

  const reorder = (values) => {
    // "altro" stays at the end whatever the drag did.
    const withoutOther = values.filter((value) => value !== "altro");
    setOrder((current) => ({ ...current, [type]: values.includes("altro") ? [...withoutOther, "altro"] : withoutOther }));
  };

  const save = async () => {
    const ok = await savePreferences({
      hiddenCategories: [...hidden].filter((value) => value !== "altro"),
      categoryOrder: {
        expense: order.expense.filter((value) => value !== "altro"),
        income: order.income.filter((value) => value !== "altro"),
      },
    });
    if (ok) onClose();
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t("profilePage.categories.title")}
      description={t("profilePage.categories.hint")}
      footer={<Button size="lg" className="w-full" onClick={save} disabled={!ready}>{t("save")}</Button>}
    >
      <SegmentedField
        label={t("profilePage.categories.title")}
        value={type}
        onChange={setType}
        options={[{ value: "expense", label: t("dashboard.expenses") }, { value: "income", label: t("dashboard.income") }]}
      />
      <Reorder.Group axis="y" values={order[type]} onReorder={reorder} className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
        {list.map((item) => (
          <CategoryItem key={item.value} item={item} hidden={hidden.has(item.value)} count={counts[item.value]} onToggle={toggle} t={t} />
        ))}
      </Reorder.Group>
      <p className="text-center text-xs text-muted-foreground">{t("profilePage.categories.dragHint")}</p>
    </Sheet>
  );
};

CategoriesSheet.propTypes = { open: PropTypes.bool.isRequired, onClose: PropTypes.func.isRequired };

/* ── Export ────────────────────────────────────────────────────────────── */
export const ExportSheet = ({ open, onClose, firstDate }) => {
  const { t, i18n } = useTranslation();
  const { currentUser } = useAuth();
  const { isDemo, transactions, fetchAllTransactions } = useUnifiedTransactions();
  const notification = useNotification();
  const thisYear = new Date().getFullYear();
  const firstYear = Math.max(thisYear - 4, firstDate ? firstDate.getFullYear() : thisYear);
  const years = [];
  for (let year = firstYear; year <= thisYear; year += 1) years.push(String(year));
  const [period, setPeriod] = useState(String(thisYear));
  const [format, setFormat] = useState("csv");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);

  const range = useMemo(() => {
    if (period === "all") return { startDate: firstDate || new Date(2000, 0, 1), endDate: endOfDay(new Date()) };
    const year = Number(period);
    return { startDate: new Date(year, 0, 1), endDate: new Date(year, 11, 31, 23, 59, 59) };
  }, [period, firstDate]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setPreview(null);
    const load = async () => {
      try {
        const data = isDemo
          ? transactions.filter((item) => item.date >= range.startDate && item.date <= range.endDate)
          : await fetchAllTransactions(period === "all" ? {} : range);
        if (!cancelled) setPreview(data);
      } catch {
        if (!cancelled) setPreview([]);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [open, period, range, isDemo, transactions, fetchAllTransactions]);

  const label = period === "all" ? t("profilePage.export.all") : period;
  const download = async () => {
    if (!preview?.length) return;
    setBusy(true);
    try {
      const options = { transactions: preview, currentUser, startDate: range.startDate, endDate: range.endDate };
      if (format === "csv") {
        await exportAnalyticsCsv({ ...options, period: label });
      } else {
        await exportAnalyticsPdf({
          ...options,
          period: "custom",
          customRange: { from: dateToDateKey(range.startDate), to: dateToDateKey(range.endDate) },
          t,
          language: i18n.language,
        });
      }
      onClose();
    } catch (error) {
      console.error("Export failed", error);
      notification.error(t("profilePage.export.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t("profilePage.export.title")}
      footer={(
        <Button size="lg" className="w-full" onClick={download} disabled={busy || !preview?.length}>
          {busy ? t("profile.exporting") : t("profilePage.export.download", { format: format.toUpperCase() })}
        </Button>
      )}
    >
      <div className="space-y-2">
        <p className="text-sm font-bold">{t("profilePage.export.period")}</p>
        <SegmentedField
          label={t("profilePage.export.period")}
          value={period}
          onChange={setPeriod}
          options={[...years.slice(-2).map((year) => ({ value: year, label: year })), { value: "all", label: t("profilePage.export.all") }]}
        />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-bold">{t("profilePage.export.format")}</p>
        <div role="radiogroup" aria-label={t("profilePage.export.format")} className="grid grid-cols-2 gap-2">
          {["csv", "pdf"].map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={format === value}
              onClick={() => setFormat(value)}
              className={cn(
                "flex flex-col gap-1 rounded-2xl border bg-card p-3.5 text-left transition-colors",
                format === value ? "border-primary ring-1 ring-primary" : "border-border hover:bg-muted/50"
              )}
            >
              <span className="font-bold">{value.toUpperCase()}</span>
              <span className="text-[13px] text-muted-foreground">{t(`profilePage.export.${value}Hint`)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 text-sm">
        <span className="text-muted-foreground">{t("profilePage.export.contents")}</span>
        <strong className="tabular-nums" data-testid="export-count">
          {preview === null ? "…" : t("profilePage.export.count", { count: preview.length })}
        </strong>
      </div>
    </Sheet>
  );
};

ExportSheet.propTypes = { open: PropTypes.bool.isRequired, onClose: PropTypes.func.isRequired, firstDate: PropTypes.instanceOf(Date) };

/* ── Install on iOS ────────────────────────────────────────────────────── */
export const InstallSheet = ({ open, onClose }) => {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()} title={t("profilePage.install.title")} description={t("profilePage.install.iosHint")}>
      <ol className="list-decimal space-y-2 pl-5 text-[15px]">
        <li>{t("profilePage.install.step1")}</li>
        <li>{t("profilePage.install.step2")}</li>
        <li>{t("profilePage.install.step3")}</li>
      </ol>
    </Sheet>
  );
};

InstallSheet.propTypes = { open: PropTypes.bool.isRequired, onClose: PropTypes.func.isRequired };
