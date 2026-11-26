import { useCallback, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { FiTrash2 } from "react-icons/fi";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import TransactionForm from "./TransactionForm.jsx";

/** Full-screen sheet on phones, centred dialog from `sm` up. */
const TransactionModal = ({ show, onClose, onSubmit, onDelete, transaction, initialDraft }) => {
  // Keep the last open payload while closing so the form does not flash or reset during the exit animation.
  const [snapshot, setSnapshot] = useState({ transaction, initialDraft });
  if (show && (snapshot.transaction !== transaction || snapshot.initialDraft !== initialDraft)) {
    setSnapshot({ transaction, initialDraft });
  }
  const activeTransaction = show ? transaction : snapshot.transaction;
  const activeDraft = show ? initialDraft : snapshot.initialDraft;
  const isEdit = !!activeTransaction;
  const { addTransaction, updateTransaction } = useUnifiedTransactions();
  const { t } = useTranslation();

  const handleSubmit = useCallback(async (payload) => {
    const success = onSubmit
      ? await onSubmit(payload)
      : isEdit
        ? await updateTransaction(activeTransaction.id, payload)
        : await addTransaction(payload);
    if (success) onClose();
    return success;
  }, [activeTransaction, addTransaction, isEdit, onClose, onSubmit, updateTransaction]);

  return (
    <Dialog open={show} onOpenChange={(open) => (!open ? onClose() : null)}>
      <DialogContent variant="sheet" className="flex h-full flex-col overflow-hidden p-0 sm:h-fit sm:max-h-[92vh]">
        <DialogHeader className="shrink-0 px-5 pb-4 pt-5 text-left short:pb-2 short:pt-3">
          <DialogTitle className="pr-10 text-xl">
            {isEdit ? t("transactionModal.editTitle") : t("transactionModal.newTitle")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? t("transactionModal.editSubtitle") : t("transactionModal.newSubtitle")}
          </DialogDescription>
        </DialogHeader>
        {isEdit && onDelete && (
          <div className="shrink-0 px-5 pb-3">
            <Button type="button" variant="outline" size="sm" onClick={onDelete}>
              <FiTrash2 aria-hidden="true" /> {t("transactions.actions.delete")}
            </Button>
          </div>
        )}
        <TransactionForm
          transaction={activeTransaction}
          initialDraft={activeDraft}
          onSubmit={handleSubmit}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
};

TransactionModal.propTypes = {
  show: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func,
  onDelete: PropTypes.func,
  transaction: PropTypes.object,
  initialDraft: PropTypes.object,
};

export default TransactionModal;
