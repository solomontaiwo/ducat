import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import PropTypes from "prop-types";
import i18n from "i18next";
import { cn } from "../../lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-40 bg-foreground/30 dark:bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-100 motion-reduce:animate-none",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;
DialogOverlay.propTypes = { className: PropTypes.string };

/**
 * DialogContent supports an optional `variant` prop:
 *   - "default"  – centered modal (existing behaviour)
 *   - "sheet"    – full-screen on mobile (fixed inset-0), centered modal on sm+
 */
const DialogContent = React.forwardRef(({ className, children, variant = "default", ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // ── sheet variant ──────────────────────────────────────────────────
        variant === "sheet" && [
          // Mobile: full-screen modal covering the entire viewport; pad top for iOS notch/status bar
          "fixed inset-0 z-50 w-full rounded-none border-0",
          "[padding-top:env(safe-area-inset-top)] sm:pt-0",
          "glass-thick text-foreground",
          // Keep the full form visible immediately; only the backdrop fades.
          // Desktop (sm+): switch to centred modal
          "sm:inset-x-auto sm:inset-y-auto sm:left-1/2 sm:top-1/2",
          "sm:-translate-x-1/2 sm:-translate-y-1/2",
          "sm:w-[92vw] sm:max-w-lg",
          "sm:rounded-[28px]",
        ],
        // ── default variant ────────────────────────────────────────────────
        variant === "default" && [
          "fixed left-1/2 top-1/2 z-50 grid w-[92vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 gap-4",
          "glass-thick p-5 sm:p-6 text-foreground",
          "rounded-[28px]",
        ],
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className={cn("absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted", variant === "sheet" && "[margin-top:env(safe-area-inset-top)] sm:mt-0")}>
        <X className="h-5 w-5" />
        <span className="sr-only">{i18n.t("common.close", { defaultValue: "Close" })}</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;
DialogContent.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node,
  variant: PropTypes.oneOf(["default", "sheet"]),
};

const DialogHeader = ({ className, ...props }) => (
  <div className={cn("flex flex-col space-y-1.5 text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";
DialogHeader.propTypes = { className: PropTypes.string };

const DialogFooter = ({ className, ...props }) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";
DialogFooter.propTypes = { className: PropTypes.string };

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("font-display text-xl font-bold leading-tight tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;
DialogTitle.propTypes = { className: PropTypes.string };

const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;
DialogDescription.propTypes = { className: PropTypes.string };

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
};
