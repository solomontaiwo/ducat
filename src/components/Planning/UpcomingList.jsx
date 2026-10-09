import { useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { CategoryBadge } from "../Transaction/TransactionRow.jsx";
import { Button } from "../ui/button";
import { formatSignedAmount } from "../../utils/formatCurrency.jsx";
import { minorToMajor } from "../../utils/money.js";
import { usePlanning } from "../../context/PlanningProvider.jsx";
import { describeWhen } from "./planningFormat.js";

/** Recurring movements due soon; the ones that ask first get a "Record" button. */
const UpcomingList = ({ items }) => {
  const { t, i18n } = useTranslation();
  const { registerOccurrence } = usePlanning();
  const [busyId, setBusyId] = useState(null);

  const register = async (rule) => {
    setBusyId(rule.id);
    try {
      await registerOccurrence(rule);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ul className="divide-y divide-border">
      {items.map((item) => {
        const { rule } = item;
        const canRegister = rule.mode === "confirm" && item.daysAway <= 0;
        const amount = formatSignedAmount(minorToMajor(rule.amountMinor), rule.type);
        const when = describeWhen(item, i18n.language, t);
        return (
          <li key={rule.id} className="flex min-w-0 items-center gap-3 py-3">
            <CategoryBadge category={rule.category} type={rule.type} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[15px] font-semibold leading-snug">{rule.description}</span>
              <span className="truncate text-[13px] font-medium text-muted-foreground">
                {canRegister ? `${amount} · ${when}` : `${when.charAt(0).toUpperCase()}${when.slice(1)} · ${t(`recurring.modeShort.${rule.mode}`)}`}
              </span>
            </span>
            {canRegister ? (
              <Button size="sm" onClick={() => register(rule)} disabled={busyId === rule.id} className="shrink-0">
                {t("recurring.register")}
              </Button>
            ) : (
              <span className={rule.type === "income" ? "amount shrink-0 text-base text-income" : "amount shrink-0 text-base"}>{amount}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
};

UpcomingList.propTypes = {
  items: PropTypes.arrayOf(PropTypes.shape({
    rule: PropTypes.object.isRequired,
    dateKey: PropTypes.string.isRequired,
    daysAway: PropTypes.number.isRequired,
  })).isRequired,
};

export default UpcomingList;
