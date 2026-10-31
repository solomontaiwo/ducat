import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiRefreshCw } from "react-icons/fi";
import { useUpdater } from "../../hooks/useUpdater";
import { SettingsRow } from "../Profile/SettingsList";
import UpdaterDialog from "./UpdaterDialog";

/**
 * Desktop-only "Check for updates" row: shows a settings entry and opens the
 * updater dialog (which checks on open). Hidden in the web runtime.
 */
const UpdateChecker = () => {
  const { t } = useTranslation();
  const updater = useUpdater();
  const { supported, check, reset } = updater;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open && supported) check();
  }, [open, supported, check]);

  if (!supported) return null;

  const handleClose = () => {
    setOpen(false);
    reset();
  };

  return (
    <>
      <SettingsRow
        icon={FiRefreshCw}
        tone="blue"
        title={t("updater.title")}
        subtitle={t("updater.rowSummary")}
        onClick={() => setOpen(true)}
        testId="row-update-check"
      />
      <UpdaterDialog open={open} onClose={handleClose} updater={updater} />
    </>
  );
};

export default UpdateChecker;
