import { forwardRef } from "react";
import { cn } from "../../lib/utils.js";
import PropTypes from "prop-types";

const Input = forwardRef(({ className, type = "text", bare = false, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-12 w-full text-base transition placeholder:text-muted-foreground/80 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        bare
          ? "border-0 bg-transparent px-1 py-2 shadow-none"
          : "rounded-xl border border-input bg-card px-3.5 py-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});

Input.displayName = "Input";

Input.propTypes = {
  className: PropTypes.string,
  type: PropTypes.string,
  bare: PropTypes.bool,
};

export { Input };
