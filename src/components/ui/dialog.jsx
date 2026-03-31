import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";
import PropTypes from "prop-types";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-40 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
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
          "bg-background text-foreground shadow-2xl",
          // Mobile enter/exit: slide up / slide down
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-8",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-8",
          "duration-300",
          // Desktop (sm+): switch to centred modal
          "sm:inset-x-auto sm:inset-y-auto sm:left-1/2 sm:top-1/2",
          "sm:-translate-x-1/2 sm:-translate-y-1/2",
          "sm:w-[92vw] sm:max-w-lg",
          "sm:rounded-2xl sm:border sm:border-border",
          "sm:data-[state=open]:zoom-in-90 sm:data-[state=open]:slide-in-from-top-8",
          "sm:data-[state=closed]:zoom-out-90 sm:data-[state=closed]:slide-out-to-top-8",
        ],
        // ── default variant ────────────────────────────────────────────────
        variant === "default" && [
          "fixed left-1/2 top-1/2 z-50 grid w-[92vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 gap-4",
          "border border-border bg-background p-4 sm:p-6 shadow-lg text-foreground",
          "duration-200 rounded-2xl",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-90 data-[state=open]:slide-in-from-top-8",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-90 data-[state=closed]:slide-out-to-top-8",
        ],
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-full p-2 text-muted-foreground transition hover:bg-muted">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
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
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
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
    className={cn("text-xl font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;
DialogTitle.propTypes = { className: PropTypes.string };

const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground dark:text-zinc-400", className)}
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
