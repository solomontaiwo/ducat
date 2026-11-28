import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { formatSignedAmount } from "../../utils/formatCurrency.jsx";
import { useAccountCurrency } from "../../hooks/useAccountCurrency.js";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";

/** Confirmation step shown before a transaction is permanently deleted. */
const DeleteTransactionDialog = ({ open, transaction, formatDate, getCategoryLabel, onCancel, onConfirm, busy = false }) => {
  const { t } = useTranslation();
  useAccountCurrency();
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && !busy && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-10">{t("transactions.deleteTitle")}</DialogTitle>
          <DialogDescription>{t("transactions.deleteDescription")}</DialogDescription>
        </DialogHeader>

        {transaction && (
          <div className="space-y-1 rounded-2xl bg-muted p-4">
            <div className="font-semibold text-foreground">{transaction.description}</div>
            <div className="text-muted-foreground text-sm">
              {formatDate(transaction.date)} • {getCategoryLabel(transaction.category)}
            </div>
            <div className={`amount text-lg ${transaction.type === "income" ? "text-income" : "text-foreground"}`}>
              {formatSignedAmount(transaction.amount, transaction.type)}
            </div>
          </div>
        )}

        {/* One row everywhere: on a short screen both buttons stay in view. */}
        <div className="flex gap-2 sm:justify-end">
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={onCancel} disabled={busy}>{t("cancel")}</Button>
          <Button variant="destructive" className="flex-1 sm:flex-none" onClick={onConfirm} disabled={busy}>{t("transactions.deleteConfirm")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

DeleteTransactionDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  transaction: PropTypes.shape({
    description: PropTypes.string,
    date: PropTypes.instanceOf(Date),
    category: PropTypes.string,
    type: PropTypes.string,
    amount: PropTypes.number,
  }),
  formatDate: PropTypes.func.isRequired,
  getCategoryLabel: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  busy: PropTypes.bool,
};

export default DeleteTransactionDialog;
