import PropTypes from "prop-types";
import { cn } from "../../lib/utils";
import { getCategoryIcon } from "../../utils/categoryIcons.jsx";
import { formatSignedAmount } from "../../utils/formatCurrency.jsx";

/** Icon + description + details + signed amount. Used by the overview and the list. */
export const CategoryBadge = ({ category, type, size = "md" }) => {
  const Icon = getCategoryIcon(category, type);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl",
        size === "md" ? "h-10 w-10" : "h-9 w-9",
        type === "income" ? "bg-income/10 text-income" : "bg-muted text-foreground"
      )}
    >
      <Icon className={size === "md" ? "h-[18px] w-[18px]" : "h-4 w-4"} />
    </span>
  );
};

CategoryBadge.propTypes = {
  category: PropTypes.string,
  type: PropTypes.oneOf(["income", "expense"]).isRequired,
  size: PropTypes.oneOf(["md", "sm"]),
};

const TransactionRow = ({ transaction, meta, onSelect, selected = false, className }) => {
  const content = (
    <>
      <CategoryBadge category={transaction.category} type={transaction.type} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-semibold leading-snug">{transaction.description}</span>
        {meta && <span className="truncate text-[13px] font-medium text-muted-foreground">{meta}</span>}
      </span>
      <span className={cn("amount shrink-0 text-base", transaction.type === "income" ? "text-income" : "text-foreground")}>
        {formatSignedAmount(transaction.amount, transaction.type)}
      </span>
    </>
  );
  const base = cn(
    "flex w-full min-w-0 items-center gap-3 py-3 text-left",
    onSelect && "rounded-xl transition-colors hover:bg-muted/60 focus-visible:bg-muted/60",
    selected && "bg-accent hover:bg-accent",
    className
  );
  if (!onSelect) return <div className={base}>{content}</div>;
  return (
    <button type="button" className={base} onClick={() => onSelect(transaction)} aria-pressed={selected || undefined}>
      {content}
    </button>
  );
};

TransactionRow.propTypes = {
  transaction: PropTypes.shape({
    id: PropTypes.string,
    description: PropTypes.string.isRequired,
    category: PropTypes.string,
    type: PropTypes.oneOf(["income", "expense"]).isRequired,
    amount: PropTypes.number.isRequired,
  }).isRequired,
  meta: PropTypes.node,
  onSelect: PropTypes.func,
  selected: PropTypes.bool,
  className: PropTypes.string,
};

export default TransactionRow;
