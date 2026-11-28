import { useRef } from "react";
import PropTypes from "prop-types";
import { DialogClose, DialogTrigger } from "@radix-ui/react-dialog";
import { useTranslation } from "react-i18next";
import { FiCheck, FiChevronDown } from "react-icons/fi";
import { useMediaQuery } from "react-responsive";
import { cn } from "../../lib/utils.js";
import { getCategoryIcon } from "../../utils/categoryIcons.jsx";
import { handleRadioKeyDown } from "../../utils/radioGroup.js";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";

const TransactionCategoryPicker = ({ categories, type, value, onChange }) => {
  const { t } = useTranslation();
  // A keyboard changes the viewport height. The picker follows the available width.
  const compact = useMediaQuery({ maxWidth: 479.98 });
  const selected = categories.find((category) => category.value === value);
  const selectedOption = useRef(null);
  const selectedRadio = useRef(null);
  const SelectedIcon = getCategoryIcon(value, type);
  const title = t("transactionModal.selectCategory");

  const renderOptions = (inSheet) => categories.map((category, index) => {
    const Icon = getCategoryIcon(category.value, type);
    const checked = category.value === value;
    const option = (
      <button
        key={category.value}
        type="button"
        ref={checked ? (inSheet ? selectedOption : selectedRadio) : undefined}
        role={inSheet ? undefined : "radio"}
        aria-pressed={inSheet ? checked : undefined}
        aria-checked={inSheet ? undefined : checked}
        tabIndex={inSheet || checked || (!selected && index === 0) ? undefined : -1}
        className={cn(
          "flex w-full min-w-0 touch-manipulation items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left text-sm outline-none transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          inSheet ? "min-h-11" : "min-h-9",
          checked ? "border-primary bg-accent font-semibold" : "border-input bg-card font-medium",
        )}
        onClick={() => onChange(category.value)}
      >
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 break-words">{category.label}</span>
        {checked && <FiCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />}
      </button>
    );
    return inSheet ? <DialogClose asChild key={category.value}>{option}</DialogClose> : option;
  });

  return (
    <Dialog>
      {compact ? (
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label={selected ? `${t("transactionModal.category")}: ${selected.label}` : title}
            className="flex min-h-12 w-full touch-manipulation items-center gap-3 rounded-xl border border-input bg-card px-3 py-2 text-left font-semibold outline-none transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <SelectedIcon aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 break-words">{selected?.label ?? title}</span>
            <FiChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </DialogTrigger>
      ) : (
        <div
          role="radiogroup"
          aria-label={t("transactionModal.category")}
          className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-2"
          onKeyDown={(event) => handleRadioKeyDown(event, categories.map((category) => category.value), value, onChange)}
        >
          {renderOptions(false)}
        </div>
      )}
      <DialogContent
        variant="bottom"
        aria-describedby={undefined}
        className="gap-3 pt-4"
        onOpenAutoFocus={(event) => {
          if (!selectedOption.current) return;
          event.preventDefault();
          selectedOption.current.focus();
        }}
        onCloseAutoFocus={(event) => {
          if (compact || !selectedRadio.current) return;
          event.preventDefault();
          selectedRadio.current.focus();
        }}
      >
        <DialogTitle className="shrink-0 pl-4 pr-14">{title}</DialogTitle>
        <div className="grid min-h-0 content-start gap-2 overflow-y-auto overscroll-contain px-4 pb-4">
          {renderOptions(true)}
        </div>
      </DialogContent>
    </Dialog>
  );
};

TransactionCategoryPicker.propTypes = {
  categories: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.string.isRequired, label: PropTypes.string.isRequired })).isRequired,
  type: PropTypes.oneOf(["expense", "income"]).isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};

export default TransactionCategoryPicker;
