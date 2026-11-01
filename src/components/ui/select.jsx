import PropTypes from "prop-types";
import { FiChevronDown } from "react-icons/fi";
import { cn } from "../../lib/utils.js";

export function Select({ className, children, ...props }) {
  return (
    <div className={cn("relative w-full", className)}>
      <select
        className="h-12 w-full touch-manipulation appearance-none rounded-xl border border-input bg-card py-2 pl-3.5 pr-10 text-base md:text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      >
        {children}
      </select>
      <FiChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

Select.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node,
};
