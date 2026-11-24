import { useMemo } from "react";
import PropTypes from "prop-types";
import { differenceInCalendarDays, endOfMonth } from "date-fns";
import { useTranslation } from "react-i18next";
import { Link } from "../../router/RouterProvider";
import { usePlanning } from "../../context/PlanningProvider.jsx";
import { formatCompactCurrency } from "../../utils/formatCurrency.jsx";
import { minorToMajor } from "../../utils/money.js";
import { budgetRows } from "../../utils/budgets.js";
import { cn } from "../../lib/utils.js";

const BAR_TONE = { ok: "bg-primary", near: "bg-warning", over: "bg-warning-strong" };

/** Month budgets on the overview; renders nothing until a budget exists. */
const BudgetCard = ({ breakdown, isCurrentMonth, endDate, monthParam }) => {
  const { t, i18n } = useTranslation();
  const { budgets } = usePlanning();
  const rows = useMemo(
    () => budgetRows(budgets, breakdown, (category) => t(`categories.${category}`, { defaultValue: category })),
    [budgets, breakdown, t]
  );
  if (!rows.length) return null;
  const daysLeft = differenceInCalendarDays(endDate || endOfMonth(new Date()), new Date());

  return (
    <section className="surface flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="budget-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="budget-title" className="text-lg font-bold">{t("budgets.cardTitle")}</h2>
        <Link to="/budgets" className="text-sm font-semibold text-primary hover:underline">{t("budgets.edit")}</Link>
      </div>
      <ul className="space-y-2">
        {rows.map((row) => {
          const query = new URLSearchParams({
            category: row.category,
            type: "expense",
            ...(monthParam ? { month: monthParam } : {}),
          }).toString();
          return (
            <li key={row.category} data-testid="budget-row" data-status={row.status}>
              <Link
                to={`/transactions?${query}`}
                className="block space-y-1.5 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-muted/60"
              >
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-semibold">{row.label}</span>
                  <span data-amount="true" className={cn("shrink-0 tabular-nums", row.status === "over" ? "font-bold text-warning-strong" : "text-muted-foreground")}>
                    {row.status === "over"
                      ? t("budgets.over", { amount: formatCompactCurrency(minorToMajor(row.spentMinor - row.limitMinor), i18n.language) })
                      : t("budgets.of", { spent: formatCompactCurrency(minorToMajor(row.spentMinor), i18n.language), limit: formatCompactCurrency(minorToMajor(row.limitMinor), i18n.language) })}
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label={row.label}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.min(100, Math.round(row.ratio * 100))}
                  aria-valuetext={row.status === "over"
                    ? t("budgets.over", { amount: formatCompactCurrency(minorToMajor(row.spentMinor - row.limitMinor), i18n.language) })
                    : t("budgets.of", { spent: formatCompactCurrency(minorToMajor(row.spentMinor), i18n.language), limit: formatCompactCurrency(minorToMajor(row.limitMinor), i18n.language) })}
                >
                  <div className={cn("h-full rounded-full", BAR_TONE[row.status])} style={{ width: `${Math.max(2, Math.min(100, row.ratio * 100))}%` }} />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      {isCurrentMonth && daysLeft > 0 && (
        <p className="text-xs font-medium text-muted-foreground">{t("budgets.daysLeft", { count: daysLeft })}</p>
      )}
    </section>
  );
};

BudgetCard.propTypes = {
  breakdown: PropTypes.object.isRequired,
  isCurrentMonth: PropTypes.bool,
  endDate: PropTypes.instanceOf(Date),
  monthParam: PropTypes.string,
};

export default BudgetCard;
