import PropTypes from "prop-types";
import { cn } from "../../lib/utils.js";

/** Consistent toggle switch used across settings and forms. */
const Switch = ({ checked, onCheckedChange, disabled = false, className, ...props }) => (
  <button
    type="button"
    role="switch"
    disabled={disabled}
    aria-checked={checked}
    onClick={() => onCheckedChange?.(!checked)}
    className={cn(
      "relative h-8 w-[52px] shrink-0 rounded-full transition-colors disabled:opacity-50",
      checked ? "bg-primary" : "bg-input",
      className
    )}
    {...props}
  >
    <span
      aria-hidden="true"
      className={cn(
        "absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-[left]",
        checked ? "left-[24px]" : "left-1"
      )}
    />
  </button>
);

Switch.propTypes = {
  checked: PropTypes.bool.isRequired,
  onCheckedChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  className: PropTypes.string,
};

export default Switch;
