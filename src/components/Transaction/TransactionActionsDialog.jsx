import PropTypes from "prop-types";
import { FiCopy, FiEdit2, FiTrash2 } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";

/** Edit / duplicate / delete menu for one transaction. */
const TransactionActionsDialog = ({ transaction, onClose, onEdit, onDuplicate, onDelete }) => {
  const { t } = useTranslation();
  return (
    <Dialog open={!!transaction} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm p-5">
        <DialogHeader>
          <DialogTitle>{transaction?.description}</DialogTitle>
          <DialogDescription>{t("transactions.actions.description")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 pt-2">
          <Button variant="outline" className="justify-start" onClick={() => onEdit(transaction)}>
            <FiEdit2 />
            {t("transactions.actions.edit")}
          </Button>
          <Button variant="outline" className="justify-start" onClick={onDuplicate}>
            <FiCopy />
            {t("transactions.actions.duplicate")}
          </Button>
          <Button variant="destructive" className="justify-start" onClick={() => onDelete(transaction.id)}>
            <FiTrash2 />
            {t("transactions.actions.delete")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

TransactionActionsDialog.propTypes = {
  transaction: PropTypes.shape({ id: PropTypes.string, description: PropTypes.string }),
  onClose: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onDuplicate: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};

export default TransactionActionsDialog;
