import * as DialogPrimitive from "@radix-ui/react-dialog";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { FiX } from "react-icons/fi";
import { cn } from "../../lib/utils";

/**
 * Glass sheet: slides up from the bottom on phones, centred card on larger
 * screens. Used for every edit in the profile so forms are never left open.
 */
const Sheet = ({ open, onOpenChange, title, description, children, footer, className }) => {
  const { t } = useTranslation();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25 backdrop-blur-[2px] dark:bg-black/60" />
        <DialogPrimitive.Content
          className={cn(
            "glass-thick fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] flex-col rounded-t-[30px] text-foreground outline-none",
            "pb-[env(safe-area-inset-bottom)]",
            "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85vh] sm:w-[92vw] sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px] sm:pb-0",
            className
          )}
        >
          <span aria-hidden="true" className="mx-auto mt-2 h-[5px] w-10 shrink-0 rounded-full bg-foreground/20 sm:hidden" />
          <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-3 sm:pt-5">
            <div className="min-w-0 space-y-1">
              <DialogPrimitive.Title className="font-display text-xl font-bold tracking-tight">{title}</DialogPrimitive.Title>
              {description
                ? <DialogPrimitive.Description className="text-sm text-muted-foreground">{description}</DialogPrimitive.Description>
                : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground/5 text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"
              aria-label={t("common.close", { defaultValue: "Chiudi" })}
            >
              <FiX className="h-4 w-4" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4 pt-2">{children}</div>
          {footer && <div className="shrink-0 border-t border-border/60 px-5 pb-5 pt-4">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

Sheet.propTypes = {
  open: PropTypes.bool.isRequired,
  onOpenChange: PropTypes.func.isRequired,
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  children: PropTypes.node,
  footer: PropTypes.node,
  className: PropTypes.string,
};

export default Sheet;
