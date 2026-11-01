import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiCheck, FiClock, FiDownload, FiRefreshCw } from "react-icons/fi";
import { useUpdaterContext } from "../../context/UpdaterProvider";
import { Button } from "../ui/button";
import { InlineSegmented } from "../Profile/SettingsList";
import { APP_VERSION } from "../../utils/appVersion";
import { readUpdaterSettings, writeUpdaterSettings } from "../../utils/updaterSettings";
import { openExternal } from "../../utils/openExternal.js";
import { cn } from "../../lib/utils.js";

const RELEASES_API = "https://api.github.com/repos/solomontaiwo/soldi-sotto/releases?per_page=8";
const RELEASES_URL = "https://github.com/solomontaiwo/soldi-sotto/releases/latest";

const formatDate = (value, language) => {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString(language, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
};

const UpdatesPage = () => {
  const { t, i18n } = useTranslation();
  const updater = useUpdaterContext();
  const [settings, setSettings] = useState(() => readUpdaterSettings());
  const [releases, setReleases] = useState(null);
  const [releasesError, setReleasesError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("bad response"))))
      .then((data) => { if (!cancelled) setReleases(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setReleasesError(true); });
    return () => { cancelled = true; };
  }, []);

  const updateSettings = (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    writeUpdaterSettings(next);
  };

  const versionBadge = (
    <span className="rounded-full bg-accent px-3 py-1 text-sm font-bold text-accent-foreground">v{APP_VERSION}</span>
  );

  if (!updater || updater.detectingSupport) {
    return (
      <div className="page-shell">
        <header className="mobile-glass-header flex items-center justify-between gap-2">
          <h1 className="text-[1.75rem] font-extrabold leading-tight md:text-3xl">{t("updater.title")}</h1>
          {versionBadge}
        </header>
        <section className="surface p-6 text-sm text-muted-foreground" role="status">{t("common.loadingPage")}</section>
      </div>
    );
  }

  if (!updater.desktop) {
    return (
      <div className="page-shell">
        <header className="mobile-glass-header flex items-center gap-2">
          <h1 className="text-[1.75rem] font-extrabold leading-tight md:text-3xl">{t("updater.title")}</h1>
        </header>
        <section className="surface p-6 text-sm text-muted-foreground">{t("updates.desktopOnly")}</section>
      </div>
    );
  }

  // deb/rpm/pacman installs are updated by the system package manager: the
  // Tauri updater only works for AppImage on Linux and must not be offered.
  if (!updater.supported) {
    return (
      <div className="page-shell">
        <header className="mobile-glass-header flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-[1.75rem] font-extrabold leading-tight md:text-3xl">{t("updater.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("updates.subtitle")}</p>
          </div>
          {versionBadge}
        </header>
        <section className="surface space-y-3 p-5 sm:p-6">
          <h2 className="text-lg font-bold">{t("updates.managedTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("updates.managedByPackageManager")}</p>
          <p className="text-sm text-muted-foreground">{t("updates.appImageHint")}</p>
          <Button onClick={() => openExternal(RELEASES_URL)}>
            <FiDownload className="h-4 w-4" aria-hidden="true" /> {t("updates.openReleases")}
          </Button>
        </section>
      </div>
    );
  }

  const { status, version, notes, progress, error, check, install, restart } = updater;
  const busy = status === "checking" || status === "downloading";
  const noteLines = (notes || "").split("\n").map((line) => line.trim()).filter(Boolean);

  return (
    <div className="page-shell">
      <header className="mobile-glass-header flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-[1.75rem] font-extrabold leading-tight md:text-3xl">{t("updater.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("updates.subtitle")}</p>
        </div>
        <span className="rounded-full bg-accent px-3 py-1 text-sm font-bold text-accent-foreground">v{APP_VERSION}</span>
      </header>

      {/* Current status */}
      <section className="surface space-y-4 p-5 sm:p-6" aria-labelledby="update-status">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <FiRefreshCw className={cn("h-5 w-5", busy && "animate-spin")} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="update-status" className="text-lg font-bold">
              {status === "available" || status === "downloaded" ? t("updater.availableTitle") : t("updates.currentVersion")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("updates.currentVersionLabel", { version: APP_VERSION })}</p>
          </div>
        </div>

        {status === "checking" && <p className="text-sm text-muted-foreground">{t("updater.checking")}</p>}

        {status === "up-to-date" && (
          <p className="flex items-center gap-2 text-sm font-semibold text-income">
            <FiCheck aria-hidden="true" /> {t("updater.upToDate")}
          </p>
        )}

        {(status === "available" || status === "downloaded") && (
          <div className="space-y-3">
            {version && <p className="text-sm font-semibold text-primary">{t("updater.availableDescription", { version: `v${version}` })}</p>}
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
              <Button onClick={restart}><FiDownload className="h-4 w-4" aria-hidden="true" /> {t("updater.restart")}</Button>
            ) : (
              <Button onClick={install}><FiDownload className="h-4 w-4" aria-hidden="true" /> {t("updater.install")}</Button>
            )}
          </div>
        )}

        {status === "downloading" && (
          <div className="space-y-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-sm text-muted-foreground">{t("updater.downloadingBody", { progress })}</p>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-warning-strong">{t("updater.error")}</p>
            {error && <p className="break-words text-[13px] text-muted-foreground">{error}</p>}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant={status === "up-to-date" ? "outline" : "default"} onClick={check} disabled={busy}>
            <FiRefreshCw className={cn("h-4 w-4", status === "checking" && "animate-spin")} aria-hidden="true" />
            {t("updates.check")}
          </Button>
        </div>
      </section>

      {/* Settings */}
      <section className="surface space-y-4 p-5 sm:p-6" aria-labelledby="update-settings">
        <h2 id="update-settings" className="text-lg font-bold">{t("updates.settingsTitle")}</h2>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold">{t("updates.autoCheck")}</p>
            <p className="text-[13px] text-muted-foreground">{t("updates.autoCheckHint")}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.autoCheck}
            aria-label={t("updates.autoCheck")}
            onClick={() => updateSettings({ autoCheck: !settings.autoCheck })}
            className={cn(
              "relative h-7 w-12 shrink-0 rounded-full transition-colors",
              settings.autoCheck ? "bg-primary" : "bg-muted"
            )}
          >
            <span
              className={cn(
                "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-[left]",
                settings.autoCheck ? "left-6" : "left-1"
              )}
              aria-hidden="true"
            />
          </button>
        </div>
        {settings.autoCheck && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-[15px] font-semibold">{t("updates.frequency")}</p>
            <InlineSegmented
              label={t("updates.frequency")}
              value={settings.frequency}
              onChange={(frequency) => updateSettings({ frequency })}
              options={[
                { value: "launch", label: t("updates.frequencyLaunch") },
                { value: "daily", label: t("updates.frequencyDaily") },
                { value: "weekly", label: t("updates.frequencyWeekly") },
              ]}
            />
          </div>
        )}
      </section>

      {/* History */}
      <section className="surface space-y-3 p-5 sm:p-6" aria-labelledby="update-history">
        <h2 id="update-history" className="flex items-center gap-2 text-lg font-bold">
          <FiClock className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> {t("updates.historyTitle")}
        </h2>
        {releasesError ? (
          <p className="text-sm text-muted-foreground">{t("updates.historyError")}</p>
        ) : releases === null ? (
          <p className="text-sm text-muted-foreground">{t("common.loadingPage")}</p>
        ) : releases.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("updates.historyEmpty")}</p>
        ) : (
          <ol className="divide-y divide-border">
            {releases.map((release) => (
              <li key={release.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-[15px] font-semibold">{release.name || release.tag_name}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(release.published_at || release.created_at, i18n.language)}</span>
                </div>
                {release.body && (
                  <p className="whitespace-pre-wrap text-[13px] leading-snug text-muted-foreground">{release.body}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
};

export default UpdatesPage;
