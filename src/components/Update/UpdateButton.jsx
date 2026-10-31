import { useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { FiRefreshCw } from "react-icons/fi";
import { useUpdaterContext } from "../../context/UpdaterProvider";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

/**
 * Desktop-only update icon: opens a popover that checks for updates, shows the
 * changelog and prompts to install / later. A green dot appears when an update
 * is ready; the icon spins while checking or downloading.
 */
const UpdateButton = ({ className }) => {
  const { t } = useTranslation();
  const updater = useUpdaterContext();
  const [open, setOpen] = useState(false);

  if (!updater?.supported) return null;

  const { status, version, notes, progress, error, check, install, restart } = updater;
  const busy = status === "checking" || status === "downloading";
  const hasUpdate = status === "available" || status === "downloaded";

  const toggle = () => {
    const willOpen = !open;
    if (!willOpen && status === "downloading") return; // never dismiss mid-install
    setOpen(willOpen);
    if (willOpen && ["idle", "up-to-date", "error"].includes(status)) check();
  };

  const close = () => setOpen(false);

  const noteLines = (notes || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={toggle}
        aria-label={t("updater.title")}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="update-button"
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
      >
        <FiRefreshCw className={cn("h-[17px] w-[17px]", busy && "animate-spin")} aria-hidden="true" />
        {hasUpdate && (
          <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-income ring-2 ring-card" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div className="absolute left-full top-0 z-50 ml-2 w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl">
          {status === "checking" && (
            <div className="px-4 py-7 text-center text-sm text-muted-foreground">{t("updater.checking")}</div>
          )}

          {status === "up-to-date" && (
            <div className="px-4 py-6 text-center">
              <p className="text-sm font-semibold text-income">{t("updater.upToDate")}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{t("updater.upToDateBody")}</p>
              <Button variant="outline" size="sm" className="mt-4 w-full" onClick={check}>{t("updater.retry")}</Button>
            </div>
          )}

          {(status === "available" || status === "downloaded") && (
            <div className="space-y-4 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <FiRefreshCw className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-base font-extrabold leading-tight">
                    {status === "downloaded" ? t("updater.downloadedTitle") : t("updater.availableTitle")}
                  </p>
                  {version && <p className="text-[13px] font-semibold text-primary">v{version}</p>}
                </div>
              </div>

              {noteLines.length > 0 && (
                <div className="rounded-xl bg-foreground/5 p-3">
                  <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">{t("updater.releaseNotes")}</p>
                  <ul className="space-y-1.5 text-[13px] leading-snug">
                    {noteLines.map((line) => (
                      <li key={line} className="flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                        <span className="min-w-0">{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {status === "downloaded" ? (
                <Button className="w-full" onClick={restart}>{t("updater.restart")}</Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={close}>{t("updater.later")}</Button>
                  <Button className="flex-1" onClick={install}>{t("updater.install")}</Button>
                </div>
              )}
            </div>
          )}

          {status === "downloading" && (
            <div className="space-y-3 p-4">
              <p className="text-sm font-semibold">{t("updater.downloadingTitle")}</p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-[13px] text-muted-foreground">{t("updater.downloadingBody", { progress })}</p>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-3 p-4">
              <p className="text-sm font-semibold text-warning-strong">{t("updater.error")}</p>
              {error && <p className="break-words text-[13px] text-muted-foreground">{error}</p>}
              <Button variant="outline" className="w-full" onClick={check}>{t("updater.retry")}</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

UpdateButton.propTypes = {
  className: PropTypes.string,
};

export default UpdateButton;
