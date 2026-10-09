import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";
import { useCategories } from "../../utils/categories.jsx";
import { useNotification } from "../../utils/notificationUtils.jsx";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Label } from "../ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { FiTrendingUp, FiTrendingDown, FiSave, FiPlus } from "react-icons/fi";
import { minorToMajor, parseMoneyToMinor } from "../../utils/money";
import { coerceDateKey, dateKeyToDate, todayDateKey } from "../../utils/dateUtils";
import { readLocalValue, writeLocalValue } from "../../utils/storage.js";

const TransactionModal = ({ show, onClose, onSubmit, transaction }) => {
  const isEdit = !!transaction;
  const { addTransaction, updateTransaction } = useUnifiedTransactions();
  const { expenseCategories, incomeCategories } = useCategories();
  const notification = useNotification();
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const requestIdRef = useRef(crypto.randomUUID());

  const [categories, setCategories] = useState([]);
  const quickAmounts = useMemo(() => [5, 10, 20, 50, 100], []);
  const QUICK_ADD_PREF_KEY = "soldi-sotto-quick-add-preferences";
  const [formData, setFormData] = useState({
    type: transaction?.type || "expense",
    amount: transaction?.amount?.toString() || "",
    description: transaction?.description || "",
    date: transaction?.dateKey || (transaction?.date ? coerceDateKey(transaction.date) : todayDateKey()),
    category: transaction?.category || "",
  });

  const updateCategories = useCallback(
    (type) => {
      const list = type === "expense" ? expenseCategories : incomeCategories;
      setCategories(list);
      if (!formData.category || !list.find((c) => c.value === formData.category)) {
        setFormData((prev) => ({ ...prev, category: list[0]?.value || "" }));
      }
    },
    [expenseCategories, incomeCategories, formData.category]
  );

  useEffect(() => {
    updateCategories(formData.type);
  }, [formData.type, updateCategories]);

  useEffect(() => {
    if (show && !isEdit) {
      requestIdRef.current = crypto.randomUUID();
      let preferredCategory = expenseCategories[0]?.value || "";
      let preferredType = "expense";
      try {
        const raw = readLocalValue(QUICK_ADD_PREF_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          preferredType = parsed.type || "expense";
          preferredCategory = parsed.category || preferredCategory;
        }
      } catch {
        // ignore malformed local preference
      }
      setFormData({
        type: preferredType,
        amount: "",
        description: "",
        date: todayDateKey(),
        category: preferredCategory,
      });
    }
    if (show && isEdit && transaction) {
      setFormData({
        type: transaction.type,
        amount: transaction.amount.toString(),
        description: transaction.description,
        date: transaction.dateKey || coerceDateKey(transaction.date),
        category: transaction.category,
      });
    }
  }, [show, isEdit, transaction, expenseCategories]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    let amountMinor;
    try {
      amountMinor = parseMoneyToMinor(formData.amount);
    } catch (error) {
      notification.error(error.i18nKey ? t(error.i18nKey) : t("transaction.invalidAmount"));
      return;
    }
    if (submitting) return;
    setSubmitting(true);

    const payload = {
      type: formData.type,
      amountMinor,
      amount: minorToMajor(amountMinor),
      description: formData.description.trim(),
      dateKey: formData.date,
      date: dateKeyToDate(formData.date),
      category: formData.category,
      clientRequestId: requestIdRef.current,
    };

    let success = false;
    try {
      if (isEdit) {
        success = await (onSubmit ? onSubmit(payload) : updateTransaction(transaction.id, payload));
      } else {
        success = await (onSubmit ? onSubmit(payload) : addTransaction(payload));
      }
    } finally {
      setSubmitting(false);
    }
    if (!success) return;
    writeLocalValue(
      QUICK_ADD_PREF_KEY,
      JSON.stringify({ type: formData.type, category: formData.category })
    );
    navigator.vibrate?.(50);
    onClose();
  };

  return (
    <Dialog open={show} onOpenChange={(open) => (!open ? onClose() : null)}>
      {/* variant="sheet": full-screen on mobile (fixed inset-0), centred modal on sm+ */}
      <DialogContent
        variant="sheet"
        className="flex flex-col p-0 bg-card/95 text-foreground h-full sm:h-auto sm:max-h-[90vh] overflow-hidden"
      >
        {/* ── Sticky header ─────────────────────────────────────────────── */}
        <DialogHeader className="shrink-0 px-5 pt-5 pb-4 border-b border-border bg-card/95">
          <DialogTitle className="flex items-center gap-3 text-xl sm:text-2xl pr-8">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              {isEdit ? "✏️" : "⚡"}
            </span>
            {isEdit ? t("transactionModal.editTitle") : t("transactionModal.newTitle")}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? t("transactionModal.editSubtitle") : t("transactionModal.newSubtitle")}
          </DialogDescription>
        </DialogHeader>

        {/* ── Scrollable form body + sticky footer ──────────────────────── */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted/50 p-1">
              <Button
                type="button"
                variant={formData.type === "expense" ? "destructive" : "outline"}
                className="w-full justify-center rounded-xl"
                onClick={() => setFormData((prev) => ({ ...prev, type: "expense" }))}
              >
                <FiTrendingDown className="mr-2 h-4 w-4" />
                {t("transactionModal.expense")}
              </Button>
              <Button
                type="button"
                variant={formData.type === "income" ? "default" : "outline"}
                className="w-full justify-center rounded-xl"
                onClick={() => setFormData((prev) => ({ ...prev, type: "income" }))}
              >
                <FiTrendingUp className="mr-2 h-4 w-4" />
                {t("transactionModal.income")}
              </Button>
            </div>

            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="transaction-amount">{t("transactionModal.amount")}</Label>
                <Input
                  id="transaction-amount"
                  type="text"
                  inputMode="decimal"
                  placeholder={t("transactionModal.amountPlaceholder")}
                  value={formData.amount}
                  onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value.replace(/[^0-9.,]/g, "") }))}
                  onBlur={(e) => {
                    const value = e.target.value;
                    if (value && value.includes(",")) {
                      const normalizedValue = value.replace(",", ".");
                      setFormData((prev) => ({ ...prev, amount: normalizedValue }));
                    }
                  }}
                  required
                  aria-label={t("transactionModal.amount")}
                  className="w-full"
                />
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {quickAmounts.map((value) => (
                    <Button
                      key={value}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          amount: String(value),
                        }))
                      }
                    >
                      €{value}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="transaction-date">{t("transactionModal.date")}</Label>
                <Input
                  id="transaction-date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
                  required
                  className="block w-full appearance-none"
                  style={{ minHeight: "2.75rem" }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="transaction-description">{t("transactionModal.description")}</Label>
              <Input
                id="transaction-description"
                type="text"
                placeholder={t("transactionModal.descriptionPlaceholder")}
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                required
                maxLength={200}
                enterKeyHint="next"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="transaction-category">{t("transactionModal.category")}</Label>
              <Select
                id="transaction-category"
                value={formData.category}
                onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
                required
              >
                <option value="">{t("transactionModal.selectCategory")}</option>
                {categories.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {/* ── Sticky footer ──────────────────────────────────────────────── */}
          <DialogFooter className="shrink-0 gap-2 px-5 py-4 border-t border-border bg-card/95 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <Button type="button" variant="outline" onClick={onClose} className="w-full sm:w-auto">
              {t("transactionModal.cancel")}
            </Button>
            <Button
              type="submit"
              className="gap-2 w-full sm:w-auto"
              disabled={submitting || !formData.amount || !formData.description || !formData.category}
            >
              {isEdit ? <FiSave className="h-4 w-4" /> : <FiPlus className="h-4 w-4" />}
              {isEdit
                ? t("transactionModal.saveChanges")
                : t("transactionModal.addButton", {
                    type:
                      formData.type === "expense"
                        ? t("transactionModal.expense")
                        : t("transactionModal.income"),
                  })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

TransactionModal.propTypes = {
  show: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func,
  transaction: PropTypes.object,
};

export default TransactionModal;
