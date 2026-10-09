import { useCallback } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import TransactionForm from "./TransactionForm.jsx";

/** Full-screen sheet on phones, centred dialog from `sm` up. */
const TransactionModal = ({ show, onClose, onSubmit, transaction }) => {
  const isEdit = !!transaction;
  const { addTransaction, updateTransaction } = useUnifiedTransactions();
  const { t } = useTranslation();

  const handleSubmit = useCallback(async (payload) => {
    const success = onSubmit
      ? await onSubmit(payload)
      : isEdit
        ? await updateTransaction(transaction.id, payload)
        : await addTransaction(payload);
    if (success) onClose();
    return success;
  }, [addTransaction, isEdit, onClose, onSubmit, transaction, updateTransaction]);

  return (
    <Dialog open={show} onOpenChange={(open) => (!open ? onClose() : null)}>
      <DialogContent variant="sheet" className="flex h-full flex-col overflow-hidden p-0 sm:h-auto sm:max-h-[92vh]">
        <DialogHeader className="shrink-0 px-5 pb-4 pt-5 text-left">
          <DialogTitle className="pr-10 text-xl">
            {isEdit ? t("transactionModal.editTitle") : t("transactionModal.newTitle")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? t("transactionModal.editSubtitle") : t("transactionModal.newSubtitle")}
          </DialogDescription>
        </DialogHeader>
        {show && (
          <TransactionForm
            transaction={transaction}
            onSubmit={handleSubmit}
            onCancel={onClose}
          />
        )}
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
