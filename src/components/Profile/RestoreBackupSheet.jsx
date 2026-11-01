import { useRef, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthProvider.jsx";
import { useNotification } from "../../utils/notificationUtils.jsx";
import { parseAccountBackup } from "../../utils/accountExport.js";
import { BackupService } from "../../services/backupService.js";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import Sheet from "../ui/sheet";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const RestoreBackupSheet = ({ onClose }) => {
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const notification = useNotification();
  const [backup, setBackup] = useState(null);
  const [error, setError] = useState("");
  const [restoreSettings, setRestoreSettings] = useState(false);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const requestRef = useRef(0);
  const savingRef = useRef(false);

  const chooseFile = async (event) => {
    const request = ++requestRef.current;
    const file = event.target.files?.[0];
    setBackup(null);
    setError("");
    setRestoreSettings(false);
    setReading(false);
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) { setError(t("backupRestore.tooLarge")); return; }
    setReading(true);
    try {
      const parsed = parseAccountBackup(await file.text(), currentUser.uid);
      if (request === requestRef.current) setBackup(parsed);
    } catch (error) {
      if (request === requestRef.current) setError(t(error.code === "backup/wrong-account" ? "backupRestore.wrongAccount" : "backupRestore.invalid"));
    } finally {
      if (request === requestRef.current) setReading(false);
    }
  };

  const restore = async () => {
    if (!backup || savingRef.current) return;
    savingRef.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await BackupService.restore(currentUser, backup, { restoreSettings });
      notification.success(t("backupRestore.success", result));
      onClose();
    } catch (error) {
      console.error("Unable to restore backup", error);
      setError(t("backupRestore.failed"));
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  };

  return (
    <Sheet open onOpenChange={(open) => !open && !busy && onClose()} title={t("backupRestore.title")} description={t("backupRestore.description")}
      footer={<Button size="lg" className="w-full" onClick={restore} disabled={!backup || reading || busy}>{t(busy ? "backupRestore.restoring" : "backupRestore.restore")}</Button>}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="backup-file">{t("backupRestore.file")}</Label>
          <Input id="backup-file" type="file" accept=".json,application/json" onChange={chooseFile} disabled={busy} />
        </div>
        {reading && <p role="status">{t("backupRestore.reading")}</p>}
        {backup && <>
          <p role="status" className="text-sm">{t("backupRestore.summary", { transactions: backup.transactions.length, recurring: backup.recurring.length })}</p>
          <p className="text-[13px] text-muted-foreground">{t("backupRestore.onlyAdds")}</p>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={restoreSettings} onChange={(event) => setRestoreSettings(event.target.checked)} disabled={busy} className="mt-1" />
            <span>{t("backupRestore.settings")}<span className="mt-1 block text-muted-foreground">{t("backupRestore.settingsHint")}</span></span>
          </label>
        </>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    </Sheet>
  );
};

RestoreBackupSheet.propTypes = { onClose: PropTypes.func.isRequired };
export default RestoreBackupSheet;
