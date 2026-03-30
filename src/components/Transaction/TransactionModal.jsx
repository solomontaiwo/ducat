import { useState, useEffect, useCallback, useMemo } from "react";
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

const MODAL_SCROLLABLE_BODY_MAX_HEIGHT = "auto";

const TransactionModal = ({ show, onClose, onSubmit, transaction }) => {
  TransactionModal.propTypes = {
    show: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onSubmit: PropTypes.func,
    transaction: PropTypes.object,
  };

  const isEdit = !!transaction;
  const { addTransaction, updateTransaction } = useUnifiedTransactions();
  const { expenseCategories, incomeCategories } = useCategories();
  const notification = useNotification();
  const { t } = useTranslation();

  const [categories, setCategories] = useState([]);
  const quickAmounts = useMemo(() => [5, 10, 20, 50, 100], []);
  const QUICK_ADD_PREF_KEY = "soldi-sotto-quick-add-preferences";
  const [formData, setFormData] = useState({
    type: transaction?.type || "expense",
    amount: transaction?.amount?.toString() || "",
    description: transaction?.description || "",
    date: transaction?.date
      ? (transaction.date instanceof Date
          ? transaction.date
          : transaction.date?.toDate?.() || new Date(transaction.date)
        ).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0],
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
      let preferredCategory = expenseCategories[0]?.value || "";
      let preferredType = "expense";
      try {
        const raw = localStorage.getItem(QUICK_ADD_PREF_KEY);
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
        date: new Date().toISOString().split("T")[0],
        category: preferredCategory,
      });
    }
    if (show && isEdit && transaction) {
      setFormData({
        type: transaction.type,
        amount: transaction.amount.toString(),
        description: transaction.description,
        date: (transaction.date instanceof Date
          ? transaction.date
          : transaction.date?.toDate?.() || new Date(transaction.date)
        ).toISOString().split("T")[0],
        category: transaction.category,
      });
    }
  }, [show, isEdit, transaction, expenseCategories]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const normalizedAmount = formData.amount.replace(",", ".");
    const amountValue = parseFloat(normalizedAmount);
    if (isNaN(amountValue) || amountValue <= 0) {
      notification.error(t("transaction.invalidAmount"));
      return;
    }

    let success = false;
    if (isEdit) {
      success = await (onSubmit
        ? onSubmit(formData)
        : updateTransaction(transaction.id, {
            type: formData.type,
            amount: amountValue,
            description: formData.description,
            date: new Date(formData.date),
            category: formData.category,
          }));
    } else {
      success = await (onSubmit
        ? onSubmit(formData)
        : addTransaction({
            type: formData.type,
            amount: amountValue,
            description: formData.description,
            date: new Date(formData.date),
            category: formData.category,
          }));
    }
    if (success) {
      localStorage.setItem(
        QUICK_ADD_PREF_KEY,
        JSON.stringify({ type: formData.type, category: formData.category })
      );
      navigator.vibrate?.(50);
      onClose();
    }
  };

  return (
    <Dialog open={show} onOpenChange={(open) => (!open ? onClose() : null)}>
      <DialogContent className="w-[96vw] max-w-lg p-0 max-h-[92vh] overflow-hidden rounded-3xl border border-border bg-card/95 text-foreground shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-xl sm:text-2xl px-5 pt-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              {isEdit ? "✏️" : "⚡"}
            </span>
            {isEdit ? t("transactionModal.editTitle") : t("transactionModal.newTitle")}
          </DialogTitle>
          <DialogDescription className="px-5">
            {isEdit ? t("transactionModal.editSubtitle") : t("transactionModal.newSubtitle")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="overflow-y-auto px-5 pb-5 space-y-5" style={{ maxHeight: MODAL_SCROLLABLE_BODY_MAX_HEIGHT }}>
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
              <Label>{t("transactionModal.amount")}</Label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder={t("transactionModal.amountPlaceholder")}
                value={formData.amount}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9.,]/g, "");
                  const parts = value.split(/[,.]/);
                  if (parts.length <= 2) setFormData((prev) => ({ ...prev, amount: value }));
                }}
                onBlur={(e) => {
                  const value = e.target.value;
                  if (value && value.includes(",")) {
                    const normalizedValue = value.replace(",", ".");
                    setFormData((prev) => ({ ...prev, amount: normalizedValue }));
                  }
                }}
                required
                className="w-full"
                autoFocus
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
              <Label>{t("transactionModal.date")}</Label>
              <div className="relative">
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
                  required
                  className="block w-full appearance-none"
                  style={{ minHeight: "2.75rem" }} 
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("transactionModal.description")}</Label>
            <Input
              type="text"
              placeholder={t("transactionModal.descriptionPlaceholder")}
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>{t("transactionModal.category")}</Label>
            <Select
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

          <DialogFooter className="gap-2 sticky bottom-0 bg-card pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose} className="w-full sm:w-auto">
              {t("transactionModal.cancel")}
            </Button>
            <Button
              type="submit"
              className="gap-2 w-full sm:w-auto"
              disabled={!formData.amount || !formData.description || !formData.category}
            >
              {isEdit ? <FiSave className="h-4 w-4" /> : <FiPlus className="h-4 w-4" />}
              {isEdit ? t("transactionModal.saveChanges") : t("transactionModal.addButton", { type: formData.type === "expense" ? t("transactionModal.expense") : t("transactionModal.income") })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TransactionModal;
