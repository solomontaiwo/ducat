import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import Sheet from "../ui/sheet";
import { Button } from "../ui/button";

/**
 * Presentational dialog for the desktop updater. Driven by a `useUpdater()`
 * instance: it renders the right step (checking / available / downloading /
 * downloaded / up-to-date / error) from `updater.status`.
 */
const UpdaterDialog = ({ open, onClose, updater }) => {
  const { t } = useTranslation();
  const { status, version, notes, progress, error, install, restart, check } = updater;

  // Never let the user dismiss the sheet while an install is in flight.
  const handleOpenChange = (next) => {
    if (!next) {
      if (status === "downloading") return;
      onClose();
    }
  };

  const title = {
    checking: t("updater.checking"),
    available: t("updater.availableTitle"),
    downloading: t("updater.downloadingTitle"),
    downloaded: t("updater.downloadedTitle"),
    "up-to-date": t("updater.upToDate"),
    error: t("updater.error"),
  }[status] ?? t("updater.checking");

  const description = status === "available" ? t("updater.availableDescription", { version }) : undefined;

  let body = null;
  let footer = null;

  if (status === "checking") {
    body = <p className="text-sm text-muted-foreground">{t("updater.checkingBody")}</p>;
  } else if (status === "up-to-date") {
    body = <p className="text-sm text-muted-foreground">{t("updater.upToDateBody")}</p>;
  } else if (status === "available") {
    body = notes ? (
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("updater.releaseNotes")}</p>
        <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground">{notes}</p>
      </div>
    ) : null;
    footer = (
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onClose}>{t("updater.later")}</Button>
        <Button className="flex-1" onClick={install}>{t("updater.install")}</Button>
      </div>
    );
  } else if (status === "downloading") {
    body = (
      <div className="space-y-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-sm text-muted-foreground">{t("updater.downloadingBody", { progress })}</p>
      </div>
    );
  } else if (status === "downloaded") {
    body = <p className="text-sm text-muted-foreground">{t("updater.downloadedBody")}</p>;
    footer = (
      <Button className="w-full" onClick={restart}>{t("updater.restart")}</Button>
    );
  } else if (status === "error") {
    body = (
      <div className="space-y-2">
        <p className="text-sm text-warning-strong">{error}</p>
        <Button variant="outline" className="w-full" onClick={check}>{t("updater.retry")}</Button>
      </div>
    );
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange} title={title} description={description}>
      {body}
      {footer}
    </Sheet>
  );
};

UpdaterDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  updater: PropTypes.shape({
    status: PropTypes.string.isRequired,
    version: PropTypes.string,
    notes: PropTypes.string,
    progress: PropTypes.number,
    error: PropTypes.string,
    check: PropTypes.func.isRequired,
    install: PropTypes.func.isRequired,
    restart: PropTypes.func.isRequired,
    reset: PropTypes.func.isRequired,
  }).isRequired,
};

export default UpdaterDialog;
