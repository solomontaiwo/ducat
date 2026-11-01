import { cn } from "../../lib/utils.js";
import { cva } from "class-variance-authority";
import PropTypes from "prop-types";

const buttonVariants = cva(
  "inline-flex touch-manipulation items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ring-offset-background",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:brightness-105",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "bg-transparent hover:bg-muted text-foreground",
        outline: "border border-input bg-card text-foreground hover:bg-muted",
        destructive: "bg-destructive text-destructive-foreground hover:brightness-95",
      },
      size: {
        default: "h-11 px-4",
        sm: "h-9 px-3 text-sm",
        lg: "h-12 px-5 text-base",
        icon: "h-11 w-11 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export function Button({ className, variant, size, type = "button", ...props }) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

Button.propTypes = {
  className: PropTypes.string,
  variant: PropTypes.oneOf(["default", "secondary", "ghost", "outline", "destructive"]),
  size: PropTypes.oneOf(["default", "sm", "lg", "icon"]),
  type: PropTypes.oneOf(["button", "submit", "reset"]),
};
