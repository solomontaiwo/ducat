import { FiWifiOff } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import { useOnlineStatus } from "../../hooks/useOnlineStatus.js";

/**
 * Tells the user that the data on screen comes from the offline cache.
 * Writes still need a connection, so saying it explicitly avoids a confusing
 * "save failed" later.
 */
const OfflineNotice = () => {
  const { t } = useTranslation();
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      className="mx-auto flex max-w-6xl items-start gap-3 rounded-2xl border border-border bg-foreground/5 p-4 text-sm"
    >
      <FiWifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <span className="font-semibold">{t("offline.title")}</span>{" "}
        <span className="text-muted-foreground">{t("offline.body")}</span>
      </p>
    </div>
  );
};

export default OfflineNotice;
