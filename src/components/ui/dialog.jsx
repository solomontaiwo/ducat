import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { FiX } from "react-icons/fi";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils.js";
import { trackOpenDialog } from "./dialogStack.js";

const Dialog = DialogPrimitive.Root;
const DialogPortal = DialogPrimitive.Portal;

const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "dialog-overlay fixed inset-0 z-40 bg-foreground/30 dark:bg-black/60 backdrop-blur-[2px] motion-reduce:animate-none",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;
DialogOverlay.propTypes = { className: PropTypes.string };

/** Mounted with the dialog content, also during its closing animation. */
const OpenDialogTracker = () => {
  React.useEffect(() => trackOpenDialog(), []);
  return null;
};

/**
 * DialogContent supports an optional `variant` prop:
 *   - "default" – centered modal
 *   - "sheet"   – full-screen sheet on mobile, centered modal on sm+
 *   - "bottom"  – bottom sheet on mobile, centered modal on sm+
 */
const DialogContent = React.forwardRef(({ className, children, variant = "default", ...props }, ref) => {
  const { t } = useTranslation();
  // `cn` does not merge conflicting classes: the default width cap applies
  // only when the caller does not set its own.
  const ownMaxWidth = /(^|\s)(sm:)?max-w-/.test(className ?? "");
  return (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "text-foreground motion-reduce:animate-none",
        // Placement (`dialog-place-*` in main.css): centred within the safe
        // area, so nothing runs under the iPhone Duo vertical bar or a notch.
        // ── bottom sheet variant ───────────────────────────────────────────
        variant === "bottom" && [
          "dialog-place-bottom dialog-motion-sheet glass-thick z-50 flex flex-col rounded-t-[30px] border-0 outline-none",
          "pb-[env(safe-area-inset-bottom)] dialog-safe-x",
          !ownMaxWidth && "sm:max-w-md",
          "sm:rounded-[28px] sm:pb-0",
        ],
        // ── sheet variant ──────────────────────────────────────────────────
        variant === "sheet" && [
          // Mobile: full-screen modal sliding up from the bottom; pad top for iOS notch/status bar
          "dialog-place-sheet dialog-motion-sheet z-50 rounded-none border-0 outline-none",
          "[padding-top:env(safe-area-inset-top)] sm:pt-0 dialog-safe-x",
          "glass-thick",
          // sm+: centred card; transform stays free for the animations
          !ownMaxWidth && "sm:max-w-lg",
          "sm:rounded-[28px]",
        ],
        // ── default variant ────────────────────────────────────────────────
        variant === "default" && [
          "dialog-place-center dialog-motion-center z-50 grid gap-4 overflow-y-auto overscroll-contain",
          !ownMaxWidth && "max-w-2xl",
          "glass-thick p-5 sm:p-6",
          "rounded-[28px]",
        ],
        className
      )}
      {...props}
    >
      <OpenDialogTracker />
      {children}
      <DialogPrimitive.Close className={cn("absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted", variant === "sheet" && "dialog-close-safe [margin-top:env(safe-area-inset-top)] sm:mt-0")}>
        <FiX className="h-5 w-5" aria-hidden="true" />
        <span className="sr-only">{t("common.close", { defaultValue: "Chiudi" })}</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;
DialogContent.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node,
  variant: PropTypes.oneOf(["default", "sheet", "bottom"]),
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
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
