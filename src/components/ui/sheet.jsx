import PropTypes from "prop-types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./dialog";

/**
 * Glass sheet used by every profile edit: slides from the bottom on phones and
 * becomes a centred card from `sm` up. It shares the dialog implementation
 * (overlay, animations, close button, focus trap) instead of duplicating it.
 */
const Sheet = ({ open, onOpenChange, title, description, children, footer, className }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent variant="bottom" className={className}>
      <span aria-hidden="true" className="mx-auto mt-2 h-[5px] w-10 shrink-0 rounded-full bg-foreground/20 sm:hidden" />
      <DialogHeader className="shrink-0 px-5 pb-2 pt-3 pr-14 sm:pt-5 sm:pr-12">
        <DialogTitle className="font-display text-xl font-bold tracking-tight">{title}</DialogTitle>
        {description
          ? <DialogDescription className="text-sm text-muted-foreground">{description}</DialogDescription>
          : <DialogDescription className="sr-only">{title}</DialogDescription>}
      </DialogHeader>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4 pt-2">{children}</div>
      {footer && <div className="shrink-0 border-t border-border/60 px-5 pb-5 pt-4">{footer}</div>}
    </DialogContent>
  </Dialog>
);

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
