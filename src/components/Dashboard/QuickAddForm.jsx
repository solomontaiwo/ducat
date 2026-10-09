import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";
import { useCategories } from "../../utils/categories.jsx";
import { useNotification } from "../../utils/notificationUtils.jsx";
import { minorToMajor, parseMoneyToMinor } from "../../utils/money";
import { dateKeyToDate, todayDateKey } from "../../utils/dateUtils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";

/** One-line entry for desktop: type, amount, description, category, date, Enter. */
const QuickAddForm = () => {
  const { t } = useTranslation();
  const { addTransaction, isDemo, canAddMoreTransactions } = useUnifiedTransactions();
  const { expenseCategories, incomeCategories } = useCategories();
  const notification = useNotification();
  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(expenseCategories[0]?.value || "");
  const [date, setDate] = useState(todayDateKey);
  const [submitting, setSubmitting] = useState(false);
  const categories = type === "expense" ? expenseCategories : incomeCategories;
  const disabled = isDemo && !canAddMoreTransactions;

  const changeType = (nextType) => {
    setType(nextType);
    const list = nextType === "expense" ? expenseCategories : incomeCategories;
    setCategory(list[0]?.value || "");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    let amountMinor;
    try {
      amountMinor = parseMoneyToMinor(amount.replace(",", "."));
    } catch (error) {
      notification.error(error.i18nKey ? t(error.i18nKey) : t("transaction.invalidAmount"));
      return;
    }
    const categoryLabel = categories.find((item) => item.value === category)?.label || category;
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
        clientRequestId: crypto.randomUUID(),
      });
      if (success) {
        setAmount("");
        setDescription("");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} aria-label={t("dashboard.quickAdd")} className="hidden flex-wrap items-center gap-2 rounded-2xl bg-muted/70 p-2.5 lg:flex">
      <label className="w-32">
        <span className="sr-only">{t("transactionModal.type")}</span>
        <Select value={type} onChange={(event) => changeType(event.target.value)} className="[&_select]:h-11" disabled={disabled}>
          <option value="expense">{t("transactionModal.expense")}</option>
          <option value="income">{t("transactionModal.income")}</option>
        </Select>
      </label>
      <label className="w-28">
        <span className="sr-only">{t("transactionModal.amount")}</span>
        <Input value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.,]/g, ""))} inputMode="decimal" placeholder="0,00 €" className="h-11 tabular-nums" disabled={disabled} />
      </label>
      <label className="min-w-[10rem] flex-1">
        <span className="sr-only">{t("transactionModal.description")}</span>
        <Input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={200} placeholder={t("transactionModal.description")} className="h-11" disabled={disabled} />
      </label>
      <label className="w-40">
        <span className="sr-only">{t("transactionModal.category")}</span>
        <Select value={category} onChange={(event) => setCategory(event.target.value)} className="[&_select]:h-11" disabled={disabled}>
          {categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </Select>
      </label>
      <label className="w-40">
        <span className="sr-only">{t("transactionModal.date")}</span>
        <Input type="date" value={date} max={todayDateKey()} onChange={(event) => event.target.value && setDate(event.target.value)} className="h-11" disabled={disabled} />
      </label>
      <Button type="submit" disabled={disabled || submitting || !amount}>{t("dashboard.quickAddSubmit")}</Button>
    </form>
  );
};

export default QuickAddForm;
