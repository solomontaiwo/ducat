import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { format, subDays } from "date-fns";
import { useCategories } from "../../utils/categories.jsx";
import { useNotification } from "../../utils/notificationUtils.jsx";
import { minorToMajor, parseMoneyToMinor } from "../../utils/money";
import { coerceDateKey, dateKeyToDate, DATE_KEY_FORMAT, todayDateKey } from "../../utils/dateUtils";
import formatCurrency from "../../utils/formatCurrency.jsx";
import { readLocalValue, writeLocalValue } from "../../utils/storage.js";
import { cn } from "../../lib/utils";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";
import { suggestCategory } from "../../utils/categorySuggest.js";
import { usePlanning } from "../../context/PlanningProvider.jsx";
import { FREQUENCIES, occurrenceDateKey } from "../../utils/recurrence.js";
import { enUS, it as itLocale } from "date-fns/locale";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

const QUICK_ADD_PREF_KEY = "soldi-sotto-quick-add-preferences";

const DEFAULT_REPEAT = Object.freeze({ enabled: false, frequency: "monthly", mode: "auto" });

const yesterdayDateKey = () => format(subDays(new Date(), 1), DATE_KEY_FORMAT);

const initialState = (transaction, expenseCategories, incomeCategories, preferences) => {
  if (transaction) {
    return {
      type: transaction.type,
      amount: transaction.amount?.toString() || "",
      description: transaction.description || "",
      date: transaction.dateKey || coerceDateKey(transaction.date),
      category: transaction.category || "",
    };
  }
  if (preferences && preferences.defaultType !== "last") {
    const type = preferences.defaultType;
    const list = type === "income" ? incomeCategories : expenseCategories;
    const category = list.some((item) => item.value === preferences.defaultCategory)
      ? preferences.defaultCategory
      : list[0]?.value || "";
    return { type, amount: "", description: "", date: todayDateKey(), category };
  }
  let type = "expense";
  let category = expenseCategories[0]?.value || "";
  try {
    const raw = readLocalValue(QUICK_ADD_PREF_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      type = parsed.type === "income" ? "income" : "expense";
      category = parsed.category || category;
    }
  } catch {
    // ignore malformed local preference
  }
  return { type, amount: "", description: "", date: todayDateKey(), category };
};

/**
 * The transaction editor shared by the mobile sheet, the desktop modal and the
 * side panel of the transaction list. `onSubmit` receives the validated payload
 * and resolves to `true` when the write succeeded.
 */
const TransactionForm = ({ transaction, onSubmit, onCancel, idPrefix = "transaction", autoFocusAmount = false, className }) => {
  const isEdit = !!transaction;
  const { visibleExpenseCategories: expenseCategories, visibleIncomeCategories: incomeCategories, expenseCategories: allExpense, incomeCategories: allIncome } = useCategories();
  const { preferences, ready: planningReady } = usePlanning();
  const notification = useNotification();
  const { t, i18n } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const requestIdRef = useRef(crypto.randomUUID());
  const [formData, setFormData] = useState(() => initialState(transaction, expenseCategories, incomeCategories, preferences));
  const [showDatePicker, setShowDatePicker] = useState(false);
  // Once the user picks a category by hand, suggestions stop overriding it.
  const [categoryTouched, setCategoryTouched] = useState(false);
  const { transactions: history } = useUnifiedTransactions();
  const [repeat, setRepeat] = useState(DEFAULT_REPEAT);

  // Reset whenever another transaction is opened in the same form instance.
  const transactionKey = transaction?.id || "new";
  useEffect(() => {
    setFormData(initialState(transaction, expenseCategories, incomeCategories, preferences));
    setShowDatePicker(false);
    setCategoryTouched(false);
    setRepeat(DEFAULT_REPEAT);
    requestIdRef.current = crypto.randomUUID();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionKey]);

  // Hidden categories stay out of the picker, except the one a movement already uses.
  const categories = useMemo(() => {
    const visible = formData.type === "expense" ? expenseCategories : incomeCategories;
    if (!transaction?.category || visible.some((item) => item.value === transaction.category)) return visible;
    const all = formData.type === "expense" ? allExpense : allIncome;
    const current = all.find((item) => item.value === transaction.category);
    return current ? [current, ...visible] : visible;
  }, [formData.type, expenseCategories, incomeCategories, allExpense, allIncome, transaction?.category]);

  // Keep the category valid for the selected type.
  useEffect(() => {
    if (!categories.some((category) => category.value === formData.category)) {
      setFormData((previous) => ({ ...previous, category: categories[0]?.value || "" }));
    }
  }, [categories, formData.category]);

  const suggestion = useMemo(() => {
    if (isEdit) return null;
    return suggestCategory(formData.description, {
      type: formData.type,
      history,
      categories: categories.map((category) => category.value),
    });
  }, [isEdit, formData.description, formData.type, history, categories]);

  useEffect(() => {
    if (suggestion && !categoryTouched && formData.category !== suggestion.category) {
      setFormData((previous) => ({ ...previous, category: suggestion.category }));
    }
  }, [suggestion, categoryTouched, formData.category]);

  const showSuggestionHint = Boolean(suggestion && formData.category === suggestion.category);

  const today = todayDateKey();
  const yesterday = yesterdayDateKey();
  const dateChoice = showDatePicker || (formData.date !== today && formData.date !== yesterday) ? "other" : formData.date === today ? "today" : "yesterday";

  const parsedAmount = useMemo(() => {
    try {
      return minorToMajor(parseMoneyToMinor(formData.amount));
    } catch {
      return null;
    }
  }, [formData.amount]);

  const typeLabel = formData.type === "expense" ? t("transactionModal.expense") : t("transactionModal.income");
  const categoryLabel = categories.find((category) => category.value === formData.category)?.label || "";

  const handleSubmit = useCallback(async (event) => {
    event?.preventDefault();
    let amountMinor;
    try {
      amountMinor = parseMoneyToMinor(formData.amount);
    } catch (error) {
      notification.error(error.i18nKey ? t(error.i18nKey) : t("transaction.invalidAmount"));
      return;
    }
    if (submitting) return;
    if (repeat.enabled && !planningReady) {
      notification.error(t("planning.loadError"));
      return;
    }
    setSubmitting(true);

    const payload = {
      type: formData.type,
      amountMinor,
      amount: minorToMajor(amountMinor),
      description: formData.description.trim() || categoryLabel || formData.category,
      dateKey: formData.date,
      date: dateKeyToDate(formData.date),
      category: formData.category,
      clientRequestId: requestIdRef.current,
      ...(repeat.enabled && !isEdit ? {
        recurring: { id: requestIdRef.current, frequency: repeat.frequency, mode: repeat.mode },
      } : {}),
    };

    let success = false;
    try {
      success = await onSubmit(payload);
    } finally {
      setSubmitting(false);
    }
    if (!success) return;
    if (!isEdit) {
      writeLocalValue(QUICK_ADD_PREF_KEY, JSON.stringify({ type: formData.type, category: formData.category }));
    }
    navigator.vibrate?.(50);
  }, [categoryLabel, formData, isEdit, notification, onSubmit, planningReady, repeat, submitting, t]);

  const nextRepeatLabel = useMemo(() => {
    if (!repeat.enabled) return "";
    try {
      const next = dateKeyToDate(occurrenceDateKey(formData.date, repeat.frequency, 1));
      return format(next, "d MMMM", { locale: i18n.language === "en" ? enUS : itLocale });
    } catch {
      return "";
    }
  }, [repeat.enabled, repeat.frequency, formData.date, i18n.language]);

  const setField = (field, value) => setFormData((previous) => ({ ...previous, [field]: value }));

  const submitLabel = isEdit
    ? t("transactionModal.saveChanges")
    : parsedAmount
      ? t("transactionModal.saveWithAmount", { type: typeLabel.toLowerCase(), amount: formatCurrency(parsedAmount) })
      : t("transactionModal.addButton", { type: typeLabel.toLowerCase() });

  return (
    <form onSubmit={handleSubmit} className={cn("flex min-h-0 flex-1 flex-col", className)} noValidate>
      <div className="flex-1 space-y-6 overflow-y-auto px-5 pb-6 pt-1">
        <div role="radiogroup" aria-label={t("transactionModal.type")} className="segmented grid-cols-2">
          {["expense", "income"].map((type) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={formData.type === type}
              onClick={() => setField("type", type)}
            >
              {type === "expense" ? t("transactionModal.expense") : t("transactionModal.income")}
            </button>
          ))}
        </div>

        <div className="flex flex-col items-center gap-3">
          <label htmlFor={`${idPrefix}-amount`} className="text-sm font-semibold text-muted-foreground">
            {t("transactionModal.amount")}
          </label>
          <div className="flex items-baseline justify-center gap-2 border-b-2 border-primary px-2 pb-1">
            <input
              id={`${idPrefix}-amount`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              autoFocus={autoFocusAmount}
              placeholder={t("transactionModal.amountPlaceholder")}
              value={formData.amount}
              onChange={(event) => setField("amount", event.target.value.replace(/[^0-9.,]/g, ""))}
              onBlur={(event) => {
                const value = event.target.value;
                if (value && value.includes(",")) setField("amount", value.replace(",", "."));
              }}
              required
              aria-label={t("transactionModal.amount")}
              className="amount w-[7.5ch] min-w-0 bg-transparent text-right text-5xl font-extrabold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/50 focus-visible:outline-none"
              style={{ fontSize: "3rem" }}
            />
            <span className="font-display text-3xl font-bold text-muted-foreground" aria-hidden="true">€</span>
          </div>
          <div className="flex max-w-full gap-2 overflow-x-auto scrollbar-none" data-swipe-ignore="true">
            {(preferences?.quickAmounts || [5, 10, 20, 50, 100]).map((value) => (
              <button key={value} type="button" className="chip h-9 px-3.5 text-[13px]" onClick={() => setField("amount", String(value))}>
                {formatCurrency(value).replace(",00", "")}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline gap-1.5">
            <label htmlFor={`${idPrefix}-description`} className="text-sm font-bold">{t("transactionModal.description")}</label>
            <span id={`${idPrefix}-description-hint`} className="text-sm text-muted-foreground">{t("transactionModal.optional")}</span>
          </div>
          <Input
            id={`${idPrefix}-description`}
            type="text"
            placeholder={t("transactionModal.descriptionPlaceholder")}
            value={formData.description}
            onChange={(event) => setField("description", event.target.value)}
            maxLength={200}
            enterKeyHint="done"
            aria-label={t("transactionModal.description")}
            aria-describedby={`${idPrefix}-description-hint`}
          />
        </div>

        <fieldset className="space-y-3">
          <legend className="mb-3 text-sm font-bold">{t("transactionModal.category")}</legend>
          {showSuggestionHint && (
            <p className="flex items-center gap-2 rounded-xl bg-accent px-3 py-2 text-[13px] text-accent-foreground" data-testid="category-suggestion">
              <span className="font-bold">{t("transactionModal.suggested")}</span>
              <span className="text-foreground/80">
                {suggestion.source === "history"
                  ? t("transactionModal.suggestedFromHistory", { count: suggestion.count })
                  : t("transactionModal.suggestedFromDescription")}
              </span>
            </p>
          )}
          <div role="radiogroup" aria-label={t("transactionModal.category")} className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category.value}
                type="button"
                role="radio"
                aria-checked={formData.category === category.value}
                className="chip"
                onClick={() => { setCategoryTouched(true); setField("category", category.value); }}
              >
                {category.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-3 text-sm font-bold">{t("transactionModal.date")}</legend>
          <div role="radiogroup" aria-label={t("transactionModal.date")} className="flex flex-wrap gap-2">
            <button type="button" role="radio" aria-checked={dateChoice === "today"} className="chip" onClick={() => { setShowDatePicker(false); setField("date", today); }}>
              {t("transactions.today")}
            </button>
            <button type="button" role="radio" aria-checked={dateChoice === "yesterday"} className="chip" onClick={() => { setShowDatePicker(false); setField("date", yesterday); }}>
              {t("transactions.yesterday")}
            </button>
            <button type="button" role="radio" aria-checked={dateChoice === "other"} className="chip" onClick={() => setShowDatePicker(true)}>
              {t("transactionModal.otherDate")}
            </button>
          </div>
          {dateChoice === "other" && (
            <Input
              id={`${idPrefix}-date`}
              type="date"
              value={formData.date}
              max={today}
              onChange={(event) => event.target.value && setField("date", event.target.value)}
              required
              aria-label={t("transactionModal.date")}
              className="block w-full appearance-none"
            />
          )}
        </fieldset>

        {!isEdit && (
          <section className="space-y-3 rounded-2xl border border-border p-4" aria-labelledby={`${idPrefix}-repeat-label`}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p id={`${idPrefix}-repeat-label`} className="text-sm font-bold">{t("recurring.repeats")}</p>
                <p className="text-[13px] text-muted-foreground">{t("recurring.repeatsHint")}</p>
              </div>
              <button
                type="button"
                role="switch"
                disabled={!planningReady}
                aria-checked={repeat.enabled}
                aria-labelledby={`${idPrefix}-repeat-label`}
                onClick={() => setRepeat((current) => ({ ...current, enabled: !current.enabled }))}
                className={cn(
                  "relative h-8 w-[52px] shrink-0 rounded-full transition-colors",
                  repeat.enabled ? "bg-primary" : "bg-input"
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-[left]",
                    repeat.enabled ? "left-[24px]" : "left-1"
                  )}
                />
              </button>
            </div>
            {repeat.enabled && (
              <>
                <div role="radiogroup" aria-label={t("recurring.frequencyLabel")} className="segmented grid-cols-3">
                  {FREQUENCIES.map((frequency) => (
                    <button
                      key={frequency}
                      type="button"
                      role="radio"
                      aria-checked={repeat.frequency === frequency}
                      onClick={() => setRepeat((current) => ({ ...current, frequency }))}
                    >
                      {t(`recurring.frequency.${frequency}`)}
                    </button>
                  ))}
                </div>
                <div role="radiogroup" aria-label={t("recurring.modeLabel")} className="segmented grid-cols-2">
                  {["auto", "confirm"].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={repeat.mode === mode}
                      onClick={() => setRepeat((current) => ({ ...current, mode }))}
                    >
                      {t(`recurring.mode.${mode}`)}
                    </button>
                  ))}
                </div>
                {nextRepeatLabel && (
                  <p className="text-[13px] text-muted-foreground">{t("recurring.nextOn", { date: nextRepeatLabel })}</p>
                )}
              </>
            )}
          </section>
        )}
      </div>

      <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:flex-row sm:justify-end sm:pb-4">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} className="sm:w-auto">
            {t("transactionModal.cancel")}
          </Button>
        )}
        <Button
          type="submit"
          size="lg"
          className="w-full sm:w-auto sm:min-w-[14rem]"
          disabled={submitting || !formData.amount || !formData.category}
        >
          {submitting ? (isEdit ? t("transactionModal.saving") : t("transactionModal.adding")) : submitLabel}
        </Button>
      </div>
    </form>
  );
};

TransactionForm.propTypes = {
  transaction: PropTypes.object,
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func,
  idPrefix: PropTypes.string,
  autoFocusAmount: PropTypes.bool,
  className: PropTypes.string,
};

export default TransactionForm;
