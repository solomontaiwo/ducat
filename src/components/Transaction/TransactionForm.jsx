import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { format, subDays } from "date-fns";
import { useCategories } from "../../utils/categories.jsx";
import { useNotification } from "../../utils/notificationUtils.jsx";
import { minorToMajor, parseMoneyToMinor } from "../../utils/money";
import { evaluateAmountExpression, formatEvaluatedAmount, hasAmountExpression, sanitizeAmountInput } from "../../utils/amountExpression.js";
import { coerceDateKey, dateKeyToDate, DATE_KEY_FORMAT, todayDateKey } from "../../utils/dateUtils";
import formatCurrency, { formatCompactCurrency } from "../../utils/formatCurrency.jsx";
import { readLocalValue, writeLocalValue } from "../../utils/storage.js";
import { cn } from "../../lib/utils.js";
import { handleRadioKeyDown } from "../../utils/radioGroup.js";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";
import { suggestCategory } from "../../utils/categorySuggest.js";
import { usePlanning } from "../../context/PlanningProvider.jsx";
import { FREQUENCIES, occurrenceDateKey } from "../../utils/recurrence.js";
import { enUS, it as itLocale } from "date-fns/locale";
import { useMediaQuery } from "react-responsive";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import Switch from "../ui/switch";
import { hapticSuccess } from "../../platform/haptics.js";
import { dismissKeyboardOnEnter } from "../../platform/native.js";
import TransactionCategoryPicker from "./TransactionCategoryPicker.jsx";

const QUICK_ADD_PREF_KEY = "ducat-quick-add-preferences";
const CALC_OPERATORS = ["+", "−", "×", "÷"];
const TRAILING_OP_RE = /[+\-−*×/÷]\s*$/;

const DEFAULT_REPEAT = Object.freeze({ enabled: false, frequency: "monthly", mode: "auto" });

const yesterdayDateKey = () => format(subDays(new Date(), 1), DATE_KEY_FORMAT);

const initialState = (transaction, expenseCategories, incomeCategories, preferences, initialDraft) => {
  if (transaction) {
    return {
      type: transaction.type,
      amount: transaction.amount?.toString() || "",
      description: transaction.description || "",
      date: transaction.dateKey || coerceDateKey(transaction.date),
      category: transaction.category || "",
    };
  }
  const applyDraft = (base) => {
    if (!initialDraft) return base;
    const type = initialDraft.type === "income" || initialDraft.type === "expense" ? initialDraft.type : base.type;
    const list = type === "income" ? incomeCategories : expenseCategories;
    const category = initialDraft.category && list.some((item) => item.value === initialDraft.category)
      ? initialDraft.category
      : list.some((item) => item.value === base.category)
        ? base.category
        : list[0]?.value || "";
    return {
      ...base,
      type,
      category,
      amount: initialDraft.amount ?? base.amount,
      description: initialDraft.description ?? base.description,
    };
  };
  if (preferences && preferences.defaultType !== "last") {
    const type = preferences.defaultType;
    const list = type === "income" ? incomeCategories : expenseCategories;
    const category = list.some((item) => item.value === preferences.defaultCategory)
      ? preferences.defaultCategory
      : list[0]?.value || "";
    return applyDraft({ type, amount: "", description: "", date: todayDateKey(), category });
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
  return applyDraft({ type, amount: "", description: "", date: todayDateKey(), category });
};

/**
 * The transaction editor shared by the mobile sheet, the desktop modal and the
 * side panel of the transaction list. `onSubmit` receives the validated payload
 * and resolves to `true` when the write succeeded.
 */
const TransactionForm = ({ transaction, initialDraft, onSubmit, onCancel, idPrefix = "transaction", autoFocusAmount = false, className }) => {
  const isEdit = !!transaction;
  const { visibleExpenseCategories: expenseCategories, visibleIncomeCategories: incomeCategories, expenseCategories: allExpense, incomeCategories: allIncome } = useCategories();
  const { preferences, ready: planningReady } = usePlanning();
  const notification = useNotification();
  const compactAmount = useMediaQuery({ maxWidth: 767, maxHeight: 740 });
  const { t, i18n } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const requestIdRef = useRef(crypto.randomUUID());
  const amountInputRef = useRef(null);
  const fieldsRef = useRef(null);
  const [formData, setFormData] = useState(() => initialState(transaction, expenseCategories, incomeCategories, preferences, initialDraft));
  const [showDatePicker, setShowDatePicker] = useState(false);
  // Once the user picks a category by hand, suggestions stop overriding it.
  const [categoryTouched, setCategoryTouched] = useState(() => Boolean(initialDraft?.category));
  const { transactions: history } = useUnifiedTransactions();
  const [repeat, setRepeat] = useState(DEFAULT_REPEAT);

  useEffect(() => {
    const fields = fieldsRef.current;
    if (!fields) return undefined;
    let frame;
    const revealFocusedField = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const field = document.activeElement;
        if (!fields.contains(field) || !field.matches("input, textarea, [contenteditable='true']")) return;
        const bounds = fields.getBoundingClientRect();
        const fieldBounds = field.getBoundingClientRect();
        const top = bounds.top + fields.clientTop;
        const bottom = top + fields.clientHeight;
        if (fieldBounds.bottom > bottom) fields.scrollTop += fieldBounds.bottom - bottom + 8;
        else if (fieldBounds.top < top) fields.scrollTop += fieldBounds.top - top - 8;
      });
    };
    // The native keyboard can resize this area after the field receives focus.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(revealFocusedField);
    observer?.observe(fields);
    fields.addEventListener("focusin", revealFocusedField);
    return () => {
      observer?.disconnect();
      fields.removeEventListener("focusin", revealFocusedField);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Reset whenever another transaction is opened in the same form instance.
  const transactionKey = transaction?.id || (initialDraft ? `draft:${JSON.stringify(initialDraft)}` : "new");
  useEffect(() => {
    setFormData(initialState(transaction, expenseCategories, incomeCategories, preferences, initialDraft));
    setShowDatePicker(false);
    setCategoryTouched(Boolean(initialDraft?.category));
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

  const isExpression = hasAmountExpression(formData.amount);
  const evaluatedAmount = useMemo(
    () => (isExpression ? evaluateAmountExpression(formData.amount) : null),
    [formData.amount, isExpression]
  );

  const parsedAmount = useMemo(() => {
    if (isExpression) return evaluatedAmount;
    try {
      return minorToMajor(parseMoneyToMinor(formData.amount));
    } catch {
      return null;
    }
  }, [formData.amount, isExpression, evaluatedAmount]);

  const typeLabel = formData.type === "expense" ? t("transactionModal.expense") : t("transactionModal.income");
  const categoryLabel = categories.find((category) => category.value === formData.category)?.label || "";

  const handleSubmit = useCallback(async (event) => {
    event?.preventDefault();
    let amountMinor;
    try {
      if (hasAmountExpression(formData.amount)) {
        const computed = evaluateAmountExpression(formData.amount);
        if (computed === null) throw new Error("Invalid expression");
        amountMinor = parseMoneyToMinor(formatEvaluatedAmount(computed));
      } else {
        amountMinor = parseMoneyToMinor(formData.amount);
      }
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
    hapticSuccess();
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

  const insertOperator = (op) => {
    setFormData((previous) => {
      const trimmed = previous.amount.trim();
      if (!trimmed) return previous;
      const next = TRAILING_OP_RE.test(trimmed)
        ? trimmed.replace(TRAILING_OP_RE, op)
        : `${trimmed}${op}`;
      return { ...previous, amount: next };
    });
    amountInputRef.current?.focus();
  };

  const applyEvaluatedAmount = () => {
    if (evaluatedAmount === null) return;
    setField("amount", formatEvaluatedAmount(evaluatedAmount));
    amountInputRef.current?.focus();
  };

  const chooseDate = (choice) => {
    if (choice === "other") {
      setShowDatePicker(true);
      return;
    }
    setShowDatePicker(false);
    setField("date", choice === "today" ? today : yesterday);
  };

  const submitLabel = isEdit
    ? t("transactionModal.saveChanges")
    : parsedAmount
      ? t("transactionModal.saveWithAmount", { type: typeLabel.toLowerCase(), amount: formatCurrency(parsedAmount) })
      : t("transactionModal.addButton", { type: typeLabel.toLowerCase() });

  const handleKeyDown = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !submitting && formData.amount && formData.category) {
      event.preventDefault();
      handleSubmit(event);
    }
  };

  return (
    <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className={cn("flex min-h-0 flex-1 flex-col", className)} noValidate>
      {/* One column; two on wide but short screens, so nothing needs
          scrolling there: how much and when on the left (type, amount, date,
          repeat), what on the right (description, category). */}
      <div ref={fieldsRef} className="flex-1 space-y-6 overflow-y-auto px-5 pb-6 pt-1 short:space-y-4 short:pb-4 wideshort:grid wideshort:grid-cols-2 wideshort:grid-rows-[auto_1fr] wideshort:items-start wideshort:gap-x-8 wideshort:gap-y-4 wideshort:space-y-0">
        <div className="space-y-6 short:space-y-4 wideshort:col-start-1 wideshort:row-start-1">
        <div
          role="radiogroup"
          aria-label={t("transactionModal.type")}
          className="segmented grid-cols-2"
          onKeyDown={(event) => handleRadioKeyDown(event, ["expense", "income"], formData.type, (next) => setField("type", next))}
        >
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

        <div className="flex flex-col items-center gap-3 short:gap-2">
          <label htmlFor={`${idPrefix}-amount`} className="text-sm font-semibold text-muted-foreground short:sr-only">
            {t("transactionModal.amount")}
          </label>
          <div className="flex items-baseline justify-center gap-2 border-b-2 border-primary px-2 pb-1">
            <input
              ref={amountInputRef}
              id={`${idPrefix}-amount`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              autoFocus={autoFocusAmount}
              placeholder={t("transactionModal.amountPlaceholder")}
              value={formData.amount}
              onChange={(event) => setField("amount", sanitizeAmountInput(event.target.value))}
              onBlur={(event) => {
                const value = event.target.value;
                if (hasAmountExpression(value)) {
                  const computed = evaluateAmountExpression(value);
                  if (computed !== null) setField("amount", formatEvaluatedAmount(computed));
                } else if (value && value.includes(",")) {
                  setField("amount", value.replace(",", "."));
                }
              }}
              required
              aria-label={t("transactionModal.amount")}
              className={cn(
                // No `amount` class: privacy mode never masks what the person is typing.
                "min-w-0 bg-transparent text-right font-display font-extrabold tabular-nums tracking-tight text-foreground outline-none placeholder:text-muted-foreground/50 focus-visible:outline-none",
                isExpression ? "w-[11ch] text-3xl" : "w-[7.5ch] text-5xl"
              )}
              style={{ fontSize: isExpression ? "2rem" : compactAmount ? "2.25rem" : "3rem" }}
            />
            <span className="font-display text-3xl font-bold text-muted-foreground" aria-hidden="true">€</span>
          </div>
          {isExpression && evaluatedAmount !== null && (
            <button
              type="button"
              data-testid="amount-calc-result"
              onClick={applyEvaluatedAmount}
              className="rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-primary transition hover:bg-primary/20"
            >
              = {formatCurrency(evaluatedAmount)}
            </button>
          )}
          <div className="flex max-w-full flex-wrap items-center justify-center gap-2">
            <div className="flex max-w-full gap-2 overflow-x-auto scrollbar-none wideshort:flex-wrap wideshort:justify-center wideshort:overflow-visible" data-swipe-ignore="true">
              {(preferences?.quickAmounts || [5, 10, 20, 50, 100]).map((value) => (
                <button key={value} type="button" className="chip h-9 px-3.5 text-[13px]" onClick={() => setField("amount", String(value))}>
                  {formatCompactCurrency(value, i18n.language)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5" role="group" aria-label={t("transactionModal.calcGroup")}>
              {CALC_OPERATORS.map((op) => (
                <button
                  key={op}
                  type="button"
                  onClick={() => insertOperator(op)}
                  disabled={!formData.amount.trim()}
                  aria-label={t("transactionModal.calcOp", { op })}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-sm font-bold text-foreground transition hover:bg-muted disabled:opacity-40"
                >
                  {op}
                </button>
              ))}
            </div>
          </div>
        </div>
        </div>

        <div className="space-y-6 short:space-y-4 wideshort:col-start-2 wideshort:row-span-2 wideshort:row-start-1">
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
            onKeyDown={dismissKeyboardOnEnter}
            aria-label={t("transactionModal.description")}
            aria-describedby={`${idPrefix}-description-hint`}
          />
        </div>

        <fieldset className="space-y-3">
          <legend className="mb-3 text-sm font-bold short:mb-2">{t("transactionModal.category")}</legend>
          <TransactionCategoryPicker
            categories={categories}
            type={formData.type}
            value={formData.category}
            onChange={(value) => { setCategoryTouched(true); setField("category", value); }}
          />
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
        </fieldset>
        </div>

        <div className="space-y-6 short:space-y-4 wideshort:col-start-1 wideshort:row-start-2">
        <fieldset className="space-y-3">
          <legend className="mb-3 text-sm font-bold short:mb-2">{t("transactionModal.date")}</legend>
          <div
            role="radiogroup"
            aria-label={t("transactionModal.date")}
            className="flex flex-wrap gap-2"
            onKeyDown={(event) => handleRadioKeyDown(event, ["today", "yesterday", "other"], dateChoice, chooseDate)}
          >
            <button type="button" role="radio" aria-checked={dateChoice === "today"} className="chip" onClick={() => chooseDate("today")}>
              {t("transactions.today")}
            </button>
            <button type="button" role="radio" aria-checked={dateChoice === "yesterday"} className="chip" onClick={() => chooseDate("yesterday")}>
              {t("transactions.yesterday")}
            </button>
            <button type="button" role="radio" aria-checked={dateChoice === "other"} className="chip" onClick={() => chooseDate("other")}>
              {t("transactionModal.otherDate")}
            </button>
          </div>
          {dateChoice === "other" && (
            <Input
              id={`${idPrefix}-date`}
              type="date"
              value={formData.date}
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
              <Switch
                checked={repeat.enabled}
                disabled={!planningReady}
                aria-labelledby={`${idPrefix}-repeat-label`}
                onCheckedChange={(enabled) => setRepeat((current) => ({ ...current, enabled }))}
              />
            </div>
            {repeat.enabled && (
              <>
                <div
                  role="radiogroup"
                  aria-label={t("recurring.frequencyLabel")}
                  className="segmented grid-cols-3"
                  onKeyDown={(event) => handleRadioKeyDown(event, FREQUENCIES, repeat.frequency, (frequency) => setRepeat((current) => ({ ...current, frequency })))}
                >
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
                <div
                  role="radiogroup"
                  aria-label={t("recurring.modeLabel")}
                  className="segmented grid-cols-2"
                  onKeyDown={(event) => handleRadioKeyDown(event, ["auto", "confirm"], repeat.mode, (mode) => setRepeat((current) => ({ ...current, mode })))}
                >
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
      </div>

      <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 short:flex-row short:pb-[calc(0.75rem+env(safe-area-inset-bottom))] short:pt-3 sm:flex-row sm:justify-end sm:pb-4">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} className="short:w-auto sm:w-auto">
            {t("transactionModal.cancel")}
          </Button>
        )}
        <Button
          type="submit"
          size="lg"
          className="w-full short:w-auto short:min-w-0 short:flex-1 sm:w-auto sm:min-w-[14rem] sm:flex-none"
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
  initialDraft: PropTypes.object,
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func,
  idPrefix: PropTypes.string,
  autoFocusAmount: PropTypes.bool,
  className: PropTypes.string,
};

export default TransactionForm;
