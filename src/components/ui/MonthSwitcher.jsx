import PropTypes from "prop-types";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils.js";
import { formatMonthLabel } from "../../utils/monthLabel";

/** "‹ Ottobre 2026 ›" control shared by the overview and the transaction list. */
const MonthSwitcher = ({ month, onPrevious, onNext, canGoNext, disabled = false, size = "lg", as: Heading = "span", className }) => {
  const { t, i18n } = useTranslation();
  const large = size === "lg";
  const buttonClass = cn(
    "flex shrink-0 items-center justify-center rounded-full text-foreground transition hover:bg-muted disabled:pointer-events-none disabled:opacity-35",
    large ? "h-11 w-11" : "h-10 w-10"
  );
  return (
    <div className={cn("flex items-center", className)} data-swipe-ignore="true">
      <button type="button" className={buttonClass} onClick={onPrevious} disabled={disabled} aria-label={t("monthSwitcher.previous")}>
        <FiChevronLeft className={large ? "h-5 w-5" : "h-4 w-4"} aria-hidden="true" />
      </button>
      <Heading
        aria-live="polite"
        className={cn(
          "min-w-0 text-center font-display font-extrabold tracking-tight tabular-nums",
          large ? "px-1 text-xl sm:text-2xl md:text-3xl" : "px-0.5 text-base",
          disabled && "opacity-50"
        )}
      >
        {formatMonthLabel(month, i18n.language, !large)}
      </Heading>
      <button type="button" className={buttonClass} onClick={onNext} disabled={disabled || !canGoNext} aria-label={t("monthSwitcher.next")}>
        <FiChevronRight className={large ? "h-5 w-5" : "h-4 w-4"} aria-hidden="true" />
      </button>
    </div>
  );
};

MonthSwitcher.propTypes = {
  month: PropTypes.instanceOf(Date).isRequired,
  onPrevious: PropTypes.func.isRequired,
  onNext: PropTypes.func.isRequired,
  canGoNext: PropTypes.bool.isRequired,
  disabled: PropTypes.bool,
  size: PropTypes.oneOf(["lg", "sm"]),
  as: PropTypes.elementType,
  className: PropTypes.string,
};

export default MonthSwitcher;
