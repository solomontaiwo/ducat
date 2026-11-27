import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";

const isApplePlatform = () => typeof navigator !== "undefined" && /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent || "");

/** Keyboard shortcuts reference dialog opened with `?` on desktop / iPad keyboard. */
const ShortcutsDialog = ({ open, onClose }) => {
  const { t } = useTranslation();
  const mod = isApplePlatform() ? "⌘" : "Ctrl";
  const rows = [
    { keys: ["N", `${mod}N`], labelKey: "shortcuts.newTransaction", alt: true },
    { keys: ["/", `${mod}K`], labelKey: "shortcuts.search", alt: true },
    { keys: ["P"], labelKey: "shortcuts.privacy" },
    { keys: ["1", "6"], labelKey: "shortcuts.navigate", range: true },
    { keys: [`${mod}↵`], labelKey: "shortcuts.saveForm" },
    { keys: ["?"], labelKey: "shortcuts.help" },
  ];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("shortcuts.title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("shortcuts.title")}</DialogDescription>
        </DialogHeader>
        <ul className="divide-y divide-border pt-1">
          {rows.map((row) => (
            <li key={row.labelKey} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="font-medium text-foreground">{t(row.labelKey)}</span>
              <span className="flex items-center gap-1 text-xs font-bold text-muted-foreground">
                {row.range ? (
                  <>
                    <kbd className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-foreground">{row.keys[0]}</kbd>
                    <span>–</span>
                    <kbd className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-foreground">{row.keys[1]}</kbd>
                  </>
                ) : row.alt ? (
                  <>
                    <kbd className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-foreground">{row.keys[0]}</kbd>
                    <span>/</span>
                    <kbd className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-foreground">{row.keys[1]}</kbd>
                  </>
                ) : (
                  row.keys.map((key) => (
                    <kbd key={key} className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-foreground">{key}</kbd>
                  ))
                )}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
};

ShortcutsDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default ShortcutsDialog;
