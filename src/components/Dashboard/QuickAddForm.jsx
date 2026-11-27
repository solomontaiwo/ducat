import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";
import { useCategories } from "../../utils/categories.jsx";
import { useNotification } from "../../utils/notificationUtils.jsx";
import { minorToMajor, parseMoneyToMinor } from "../../utils/money";
import { evaluateAmountExpression, formatEvaluatedAmount, hasAmountExpression, sanitizeAmountInput } from "../../utils/amountExpression.js";
import { dateKeyToDate, todayDateKey } from "../../utils/dateUtils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { suggestCategory } from "../../utils/categorySuggest.js";
import { hapticSuccess } from "../../platform/haptics.js";

/** Quick entry for desktop: type, amount, description, category, date, Enter. */
const QuickAddForm = ({ preferences = null }) => {
  const { t } = useTranslation();
  const { addTransaction, isDemo, canAddMoreTransactions, transactions: history } = useUnifiedTransactions();
  const { visibleExpenseCategories: expenseCategories, visibleIncomeCategories: incomeCategories } = useCategories();
  const notification = useNotification();
  const [type, setType] = useState(() => (preferences?.defaultType === "income" ? "income" : "expense"));
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(() => {
    const list = preferences?.defaultType === "income" ? incomeCategories : expenseCategories;
    if (preferences?.defaultType && preferences.defaultType !== "last" && list.some((item) => item.value === preferences.defaultCategory)) {
      return preferences.defaultCategory;
    }
    return list[0]?.value || "";
  });
  const [date, setDate] = useState(todayDateKey);
  const lastTodayRef = useRef(todayDateKey());
  const [submitting, setSubmitting] = useState(false);
  const requestIdRef = useRef(crypto.randomUUID());
  const submittingRef = useRef(false);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const categories = type === "expense" ? expenseCategories : incomeCategories;
  const disabled = isDemo && !canAddMoreTransactions;

  // Keep the default date current if the desktop app stays open past midnight.
  useEffect(() => {
    const syncDate = () => {
      const nowKey = todayDateKey();
      if (nowKey !== lastTodayRef.current) {
        const previousToday = lastTodayRef.current;
        lastTodayRef.current = nowKey;
        setDate((current) => (current === previousToday ? nowKey : current));
      }
    };
    const interval = window.setInterval(syncDate, 60_000);
    window.addEventListener("focus", syncDate);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", syncDate);
    };
  }, []);

  // Preferences (hidden categories, order) can finish loading after mount, so
  // keep the selected category valid instead of submitting a stale value.
  useEffect(() => {
    if (!categories.some((item) => item.value === category)) {
      setCategory(categories[0]?.value || "");
    }
  }, [categories, category]);

  const changeType = (nextType) => {
    setType(nextType);
    const list = nextType === "expense" ? expenseCategories : incomeCategories;
    setCategory(list[0]?.value || "");
  };

  const changeDescription = (value) => {
    setDescription(value);
    if (categoryTouched) return;
    const suggestion = suggestCategory(value, { type, history, categories: categories.map((item) => item.value) });
    if (suggestion) setCategory(suggestion.category);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (disabled || submittingRef.current) return;
    let amountMinor;
    try {
      if (hasAmountExpression(amount)) {
        const computed = evaluateAmountExpression(amount);
        if (computed === null) throw new Error("Invalid expression");
        amountMinor = parseMoneyToMinor(formatEvaluatedAmount(computed));
      } else {
        amountMinor = parseMoneyToMinor(amount.replace(",", "."));
      }
    } catch (error) {
      notification.error(error.i18nKey ? t(error.i18nKey) : t("transaction.invalidAmount"));
      return;
    }
    const categoryLabel = categories.find((item) => item.value === category)?.label || category;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const success = await addTransaction({
        type,
        amountMinor,
        amount: minorToMajor(amountMinor),
        description: description.trim() || categoryLabel,
        dateKey: date,
        date: dateKeyToDate(date),
        category,
        clientRequestId: requestIdRef.current,
      });
      if (success) {
        requestIdRef.current = crypto.randomUUID();
        setAmount("");
        setDescription("");
        setCategoryTouched(false);
        hapticSuccess();
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} aria-label={t("dashboard.quickAdd")} className="quick-add hidden items-center gap-2 rounded-2xl bg-muted/70 p-2.5 lg:grid">
      <label className="min-w-0">
        <span className="sr-only">{t("transactionModal.type")}</span>
        <Select value={type} onChange={(event) => changeType(event.target.value)} disabled={disabled}>
          <option value="expense">{t("transactionModal.expense")}</option>
          <option value="income">{t("transactionModal.income")}</option>
        </Select>
      </label>
      <label className="min-w-0">
        <span className="sr-only">{t("transactionModal.amount")}</span>
        <Input
          value={amount}
          onChange={(event) => setAmount(sanitizeAmountInput(event.target.value))}
          onBlur={(event) => {
            const value = event.target.value;
            if (hasAmountExpression(value)) {
              const computed = evaluateAmountExpression(value);
              if (computed !== null) setAmount(formatEvaluatedAmount(computed));
            }
          }}
          inputMode="decimal"
          placeholder={`${t("transactionModal.amountPlaceholder")} €`}
          className="tabular-nums"
          disabled={disabled}
        />
      </label>
      <label className="min-w-0">
        <span className="sr-only">{t("transactionModal.description")}</span>
        <Input value={description} onChange={(event) => changeDescription(event.target.value)} maxLength={200} placeholder={t("transactionModal.description")} disabled={disabled} />
      </label>
      <label className="min-w-0">
        <span className="sr-only">{t("transactionModal.category")}</span>
        <Select value={category} onChange={(event) => { setCategoryTouched(true); setCategory(event.target.value); }} disabled={disabled}>
          {categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </Select>
      </label>
      <label className="min-w-0">
        <span className="sr-only">{t("transactionModal.date")}</span>
        <Input type="date" value={date} onChange={(event) => event.target.value && setDate(event.target.value)} className="min-w-0 max-w-full appearance-none" disabled={disabled} />
      </label>
      <Button type="submit" disabled={disabled || submitting || !amount}>{t("dashboard.quickAddSubmit")}</Button>
    </form>
  );
};

QuickAddForm.propTypes = {
  preferences: PropTypes.shape({
    defaultType: PropTypes.string,
    defaultCategory: PropTypes.string,
  }),
};

export default QuickAddForm;
