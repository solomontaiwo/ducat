import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { compareTransactions } from "../../utils/transactionOrder.js";
import { formatRowDate } from "../../utils/transactionGrouping.js";
import TransactionRow from "../Transaction/TransactionRow.jsx";
import { Button } from "../ui/button";

const RecentTransactions = ({ transactions = [], loading = false, onSelect, onAddFirst, emptyLabel, limit = 5 }) => {
  const { t, i18n } = useTranslation();
  const recent = [...transactions].sort(compareTransactions).slice(0, limit);

  if (loading) {
    return (
      <div className="space-y-3 py-2" aria-busy="true">
        {[...Array(3)].map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton width={40} height={40} borderRadius={12} />
            <div className="flex-1">
              <Skeleton height={15} width={140} />
              <Skeleton height={12} width={90} />
            </div>
            <Skeleton height={18} width={70} />
          </div>
        ))}
      </div>
    );
  }

  if (recent.length === 0) {
    return (
      <div className="space-y-4 py-6 text-center">
        <p className="text-sm text-muted-foreground">{emptyLabel || t("recentTransactions.emptyDescription")}</p>
        {onAddFirst && <Button onClick={onAddFirst}>{t("recentTransactions.addFirst")}</Button>}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {recent.map((transaction) => (
        <li key={transaction.id}>
          <TransactionRow
            transaction={transaction}
            onSelect={onSelect}
            className="px-1"
            meta={`${t(`categories.${transaction.category}`, { defaultValue: transaction.category })} · ${formatRowDate(transaction.date, i18n.language, t)}`}
          />
        </li>
      ))}
    </ul>
  );
};

RecentTransactions.propTypes = {
  transactions: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      description: PropTypes.string.isRequired,
      amount: PropTypes.number.isRequired,
      type: PropTypes.oneOf(["income", "expense"]).isRequired,
      date: PropTypes.instanceOf(Date).isRequired,
      category: PropTypes.string,
    })
  ),
  loading: PropTypes.bool,
  onSelect: PropTypes.func,
  onAddFirst: PropTypes.func,
  emptyLabel: PropTypes.string,
  limit: PropTypes.number,
};

export default RecentTransactions;
