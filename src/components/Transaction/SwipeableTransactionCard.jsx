import PropTypes from "prop-types";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useDrag } from "@use-gesture/react";
import { format } from "date-fns";
import { enUS, it } from "date-fns/locale";
import { FiMoreVertical, FiTrash2 } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import formatCurrency from "../../utils/formatCurrency.jsx";
import { Button } from "../ui/button";

const SWIPE_DELETE_THRESHOLD = 80;
const SWIPE_VELOCITY_THRESHOLD = 0.5;
const SNAP_ANIMATION = { type: "spring", stiffness: 500, damping: 40 };

const SwipeableTransactionCard = ({ transaction, onActions, onDelete, language, getCategoryLabel }) => {
  const { t } = useTranslation();
  const x = useMotionValue(0);
  const deleteOpacity = useTransform(x, [-SWIPE_DELETE_THRESHOLD, -20], [1, 0]);

  const bind = useDrag(
    ({ down, movement: [mx], velocity: [vx], direction: [dx] }) => {
      if (down) {
        x.set(Math.min(0, mx));
      } else {
        if (mx < -SWIPE_DELETE_THRESHOLD || (vx > SWIPE_VELOCITY_THRESHOLD && dx < 0)) {
          onDelete(transaction.id);
        }
        animate(x, 0, SNAP_ANIMATION);
      }
    },
    { axis: "x", filterTaps: true }
  );

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <motion.div
        style={{ opacity: deleteOpacity }}
        className="absolute inset-y-0 right-0 flex items-center bg-destructive px-5 rounded-r-2xl"
        aria-hidden="true"
      >
        <FiTrash2 className="h-5 w-5 text-white" />
      </motion.div>
      <motion.div
        style={{ x }}
        {...bind()}
        className="relative z-10 flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-card/80 p-3 shadow-sm touch-pan-y sm:p-4"
      >
        <div className="min-w-0 flex-1 space-y-1">
            <div className="truncate text-sm font-semibold leading-tight sm:text-base">{transaction.description}</div>
            <div className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
              <span>
                {format(transaction.date, language === "it" ? "dd MMM yyyy" : "MMM dd, yyyy", {
                  locale: language === "it" ? it : enUS,
                })}
              </span>
              <span>•</span>
              <span className="truncate">{getCategoryLabel(transaction.category)}</span>
            </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <div
            className={`text-right text-sm font-bold sm:text-base ${
              transaction.type === "income" ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {transaction.type === "income" ? "+" : "-"}
            {formatCurrency(transaction.amount)}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-9 w-9 shrink-0 p-0"
            aria-label={t("transactions.actions.open")}
            onClick={(e) => {
              e.stopPropagation();
              onActions(transaction);
            }}
          >
            <FiMoreVertical className="h-5 w-5" />
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

SwipeableTransactionCard.propTypes = {
  transaction: PropTypes.shape({
    id: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired,
    date: PropTypes.instanceOf(Date).isRequired,
    category: PropTypes.string.isRequired,
    type: PropTypes.oneOf(["income", "expense"]).isRequired,
    amount: PropTypes.number.isRequired,
  }).isRequired,
  onActions: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  language: PropTypes.string.isRequired,
  getCategoryLabel: PropTypes.func.isRequired,
};

export default SwipeableTransactionCard;
