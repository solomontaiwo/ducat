import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthProvider.jsx";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";
import { usePlanning } from "../../context/PlanningProvider.jsx";
import { useCategories } from "../../utils/categories.jsx";
import { useNotification } from "../../utils/notificationUtils.jsx";
import { useNavigate } from "../../router/RouterProvider";
import { CategoryBadge } from "../Transaction/TransactionRow.jsx";
import { Button } from "../ui/button";
import formatCurrency from "../../utils/formatCurrency.jsx";
import { minorToMajor, parseMoneyToMinor } from "../../utils/money.js";
import { averageByCategory, averageRange, suggestLimitMinor } from "../../utils/budgets.js";
import BackButton from "./BackButton.jsx";

const toInput = (minor) => (minor ? String(minorToMajor(minor)).replace(".", ",") : "");

const BudgetsPage = () => {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const { isDemo, transactions, fetchAllTransactions } = useUnifiedTransactions();
  const { budgets, ready, saveBudgets } = usePlanning();
  const { expenseCategories } = useCategories();
  const notification = useNotification();
  const navigate = useNavigate();
  const [values, setValues] = useState({});
  const [averages, setAverages] = useState({});
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!touched) setValues(Object.fromEntries(Object.entries(budgets).map(([category, minor]) => [category, toInput(minor)])));
  }, [budgets, touched]);

  useEffect(() => {
    let cancelled = false;
    const range = averageRange();
    const load = async () => {
      try {
        const data = isDemo ? transactions : currentUser ? await fetchAllTransactions(range) : [];
        if (!cancelled) setAverages(averageByCategory(data, range));
      } catch {
        if (!cancelled) setAverages({});
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isDemo, transactions, currentUser, fetchAllTransactions]);

  const categories = useMemo(() => expenseCategories.filter((category) => category.value !== "altro"), [expenseCategories]);

  const totalMinor = useMemo(() => Object.values(values).reduce((sum, value) => {
    try {
      return value ? sum + parseMoneyToMinor(value.replace(",", ".")) : sum;
    } catch {
      return sum;
    }
  }, 0), [values]);

  const setValue = (category, value) => {
    setTouched(true);
    setValues((current) => ({ ...current, [category]: value.replace(/[^0-9.,]/g, "") }));
  };

  const applySuggestions = () => {
    setTouched(true);
    setValues((current) => {
      const next = { ...current };
      categories.forEach(({ value }) => {
        const suggestion = suggestLimitMinor(averages[value]);
        if (!next[value] && suggestion) next[value] = toInput(suggestion);
      });
      return next;
    });
  };

  const handleSave = async () => {
    const limits = {};
    for (const [category, value] of Object.entries(values)) {
      if (!value) continue;
      try {
        const minor = parseMoneyToMinor(value.replace(",", "."));
        if (minor > 0) limits[category] = minor;
      } catch {
        notification.error(t("transaction.invalidAmount"));
        return;
      }
    }
    setSaving(true);
    try {
      if (await saveBudgets(limits)) {
        notification.success(t("budgets.saved"));
        setTouched(false);
        navigate("/dashboard");
      }
    } finally {
      setSaving(false);
    }
  };

  const hasSuggestions = categories.some(({ value }) => !values[value] && suggestLimitMinor(averages[value]));

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 md:space-y-6">
      <header className="flex items-center gap-2">
        <BackButton />
        <h1 className="text-[1.75rem] font-extrabold leading-tight md:text-3xl">{t("budgets.title")}</h1>
      </header>

      <section className="surface flex items-center justify-between gap-4 p-5">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">{t("budgets.total")}</p>
          <p className="amount text-2xl">{formatCurrency(minorToMajor(totalMinor))}</p>
        </div>
        <p className="max-w-[16rem] text-right text-[13px] text-muted-foreground">{t("budgets.intro")}</p>
      </section>

      <ul className="surface divide-y divide-border px-4">
        {categories.map(({ value, label }) => {
          const average = averages[value];
          const suggestion = suggestLimitMinor(average);
          const inputId = `budget-${value}`;
          return (
            <li key={value} className="flex items-center gap-3 py-3">
              <CategoryBadge category={value} type="expense" size="sm" />
              <label htmlFor={inputId} className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-semibold leading-snug">{label}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {average ? t("budgets.average", { amount: formatCurrency(minorToMajor(average)) }) : t("budgets.noAverage")}
                </span>
              </label>
              <div className="relative w-28 shrink-0">
                <input
                  id={inputId}
                  inputMode="decimal"
                  autoComplete="off"
                  value={values[value] || ""}
                  onChange={(event) => setValue(value, event.target.value)}
                  placeholder={suggestion ? toInput(suggestion) : "—"}
                  aria-label={t("budgets.limitFor", { category: label })}
                  className="h-11 w-full rounded-xl border border-input bg-card pl-3 pr-8 text-right text-base font-semibold tabular-nums outline-none transition placeholder:font-normal placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground" aria-hidden="true">€</span>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {hasSuggestions && (
          <Button variant="outline" onClick={applySuggestions}>{t("budgets.useSuggestions")}</Button>
        )}
        <Button size="lg" onClick={handleSave} disabled={saving || !ready}>{t("budgets.save")}</Button>
      </div>
    </div>
  );
};

export default BudgetsPage;
