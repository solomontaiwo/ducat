import { useRef } from "react";
import PropTypes from "prop-types";
import { FiCopy, FiEdit2, FiTrash2 } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import Sheet from "../ui/sheet";

/**
 * Edit / duplicate / delete menu for one transaction: an action sheet rising
 * from the bottom on phones, a centred card from `sm` up.
 */
const TransactionActionsDialog = ({ transaction, onClose, onEdit, onDuplicate, onDelete }) => {
  const { t } = useTranslation();
  // Keeps the title while the sheet animates away after `transaction` clears.
  const shown = useRef(transaction);
  if (transaction) shown.current = transaction;
  return (
    <Sheet
      open={!!transaction}
      onOpenChange={(open) => !open && onClose()}
      title={shown.current?.description ?? ""}
      description={t("transactions.actions.description")}
      className="sm:max-w-sm"
    >
      <div className="grid gap-2">
        <Button variant="outline" className="h-12 justify-start" onClick={() => onEdit(transaction)}>
          <FiEdit2 />
          {t("transactions.actions.edit")}
        </Button>
        <Button variant="outline" className="h-12 justify-start" onClick={onDuplicate}>
          <FiCopy />
          {t("transactions.actions.duplicate")}
        </Button>
        <Button variant="outline" className="h-12 justify-start text-destructive hover:text-destructive" onClick={() => onDelete(transaction.id)}>
          <FiTrash2 />
          {t("transactions.actions.delete")}
        </Button>
      </div>
    </Sheet>
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
