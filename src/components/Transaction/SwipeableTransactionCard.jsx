import PropTypes from "prop-types";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useDrag } from "@use-gesture/react";
import { FiTrash2 } from "react-icons/fi";
import TransactionRow from "./TransactionRow.jsx";

const SWIPE_DELETE_THRESHOLD = 88;
const SWIPE_VELOCITY_THRESHOLD = 0.5;
const SNAP_ANIMATION = { type: "spring", stiffness: 500, damping: 40 };
const coarsePointer = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

/** A list row that opens on tap and asks for deletion when swiped left (touch only). */
const SwipeableTransactionCard = ({ transaction, meta, onSelect, onDelete, selected = false }) => {
  const x = useMotionValue(0);
  const deleteOpacity = useTransform(x, [-SWIPE_DELETE_THRESHOLD, -16], [1, 0]);

  const bind = useDrag(
    ({ down, movement: [mx], velocity: [vx], direction: [dx] }) => {
      if (down) {
        x.set(Math.min(0, mx));
      } else {
        if (mx < -SWIPE_DELETE_THRESHOLD || (vx > SWIPE_VELOCITY_THRESHOLD && dx < 0 && mx < -24)) {
          onDelete(transaction.id);
        }
        animate(x, 0, SNAP_ANIMATION);
      }
    },
    { axis: "x", filterTaps: true, enabled: coarsePointer() }
  );

  return (
    <div className="relative overflow-hidden" data-swipe-ignore="true">
      <motion.div
        style={{ opacity: deleteOpacity }}
        className="absolute inset-y-0 right-0 flex w-1/2 items-center justify-end bg-destructive pr-5"
        aria-hidden="true"
      >
        <FiTrash2 className="h-5 w-5 text-destructive-foreground" />
      </motion.div>
      <motion.div style={{ x }} {...bind()} className="relative z-10 touch-pan-y bg-card">
        <TransactionRow transaction={transaction} meta={meta} onSelect={onSelect} selected={selected} className="px-2" />
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
  meta: PropTypes.node,
  onSelect: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  selected: PropTypes.bool,
};

export default SwipeableTransactionCard;
