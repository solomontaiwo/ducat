import { FiRefreshCw, FiWifiOff } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import { useOnlineStatus } from "../../hooks/useOnlineStatus.js";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";

/**
 * Tells the user when the app is offline (new movements are queued locally)
 * and shows sync status / manual retry when queued items are waiting to upload.
 */
const OfflineNotice = () => {
  const { t } = useTranslation();
  const online = useOnlineStatus();
  const { pendingOfflineCount = 0, syncingOfflineQueue = false, offlineSyncFailed = false, lastOfflineSync, syncOfflineQueue } = useUnifiedTransactions();

  if (online && pendingOfflineCount === 0) return null;

  if (!online) {
    return (
      <div
        role="status"
        className="workspace-width flex items-start gap-3 rounded-2xl border border-border bg-foreground/5 p-4 text-sm"
      >
        <FiWifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1">
          <span className="font-semibold">{t("offline.title")}</span>{" "}
          <span className="text-muted-foreground">
            {pendingOfflineCount > 0
              ? t("offline.bodyWithPending", { count: pendingOfflineCount })
              : t("offline.body")}
          </span>
        </p>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="workspace-width flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-accent/80 p-4 text-sm"
    >
      <p className="min-w-0 flex-1 font-medium text-accent-foreground">
        {syncingOfflineQueue
          ? t("offline.syncing", { count: pendingOfflineCount })
          : offlineSyncFailed ? t("offline.syncFailed", { count: pendingOfflineCount }) : t("offline.pendingReady", { count: pendingOfflineCount })}
        {lastOfflineSync && <span className="block text-xs font-normal">{t("offline.lastSync", { time: new Date(lastOfflineSync).toLocaleString() })}</span>}
      </p>
      {!syncingOfflineQueue && syncOfflineQueue && (
        <button
          type="button"
          onClick={() => syncOfflineQueue().catch(() => {})}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-primary/40 bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
        >
          <FiRefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          {t("offline.syncNow")}
        </button>
      )}
    </div>
  );
};

export default OfflineNotice;
