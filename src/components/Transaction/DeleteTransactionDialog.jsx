import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { formatSignedAmount } from "../../utils/formatCurrency.jsx";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";

/** Confirmation step shown before a transaction is permanently deleted. */
const DeleteTransactionDialog = ({ open, transaction, formatDate, getCategoryLabel, onCancel, onConfirm }) => {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("confirmDelete")}</DialogTitle>
          <DialogDescription>{t("transactions.deleteConfirm")}</DialogDescription>
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

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>{t("cancel")}</Button>
          <Button variant="destructive" onClick={onConfirm}>{t("transactions.deleteConfirm")}</Button>
        </DialogFooter>
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
};

export default DeleteTransactionDialog;
