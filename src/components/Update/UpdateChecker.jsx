import { useTranslation } from "react-i18next";
import { FiRefreshCw } from "react-icons/fi";
import { useUpdaterContext } from "../../context/UpdaterProvider";
import { SettingsRow } from "../Profile/SettingsList";

/**
 * Desktop-only "Updates" row in the profile, linking to the updates page.
 */
const UpdateChecker = () => {
  const { t } = useTranslation();
  const updater = useUpdaterContext();

  if (!updater?.supported) return null;

  return (
    <SettingsRow
      icon={FiRefreshCw}
      tone="blue"
      title={t("updater.title")}
      subtitle={t("updater.rowSummary")}
      to="/updates"
      testId="row-update-check"
    />
  );
};

export default UpdateChecker;
