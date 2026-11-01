import PropTypes from "prop-types";
import { cn } from "../../lib/utils.js";

export function Card({ className, children, ...props }) {
  return (
    <div
      className={cn(
        "surface",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }) {
  return (
    <div className={cn("flex flex-col space-y-1.5 p-5 sm:p-6", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }) {
  return (
    <h3 className={cn("font-display text-lg font-bold leading-tight tracking-tight", className)} {...props}>
      {children}
    </h3>
  );
}

export function CardDescription({ className, children, ...props }) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)} {...props}>
      {children}
    </p>
  );
}

export function CardContent({ className, children, ...props }) {
  return (
    <div className={cn("p-5 pt-0 sm:p-6 sm:pt-0", className)} {...props}>
      {children}
    </div>
  );
}

Card.propTypes = CardHeader.propTypes = CardContent.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node,
};

CardTitle.propTypes = CardDescription.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node,
};
