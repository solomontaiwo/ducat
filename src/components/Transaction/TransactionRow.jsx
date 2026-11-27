import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { FiCalendar, FiClock } from "react-icons/fi";
import { cn } from "../../lib/utils.js";
import { getCategoryIcon } from "../../utils/categoryIcons.jsx";
import { formatSignedAmount } from "../../utils/formatCurrency.jsx";
import { coerceDateKey, todayDateKey } from "../../utils/dateUtils.js";

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
  const { t } = useTranslation();
  const dateKey = transaction.dateKey || (transaction.date ? coerceDateKey(transaction.date) : "");
  const isScheduled = Boolean(dateKey && dateKey > todayDateKey());
  const content = (
    <>
      <CategoryBadge category={transaction.category} type={transaction.type} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-base font-semibold leading-snug">{transaction.description}</span>
        {(meta || transaction.pendingSync || isScheduled) && (
          <span className="flex items-center gap-1.5 truncate text-sm font-medium text-muted-foreground">
            {meta && <span className="truncate">{meta}</span>}
            {isScheduled && (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
                <FiCalendar className="h-3 w-3" aria-hidden="true" />
                {t("transactions.scheduledBadge")}
              </span>
            )}
            {transaction.pendingSync && (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-warning-strong">
                <FiClock className="h-3 w-3" aria-hidden="true" />
                {t("offline.pendingBadge")}
              </span>
            )}
          </span>
        )}
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
    dateKey: PropTypes.string,
    date: PropTypes.instanceOf(Date),
    pendingSync: PropTypes.bool,
  }).isRequired,
  meta: PropTypes.node,
  onSelect: PropTypes.func,
  selected: PropTypes.bool,
  className: PropTypes.string,
};

export default TransactionRow;
