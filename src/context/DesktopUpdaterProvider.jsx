import { useEffect } from "react";
import PropTypes from "prop-types";
import { useUpdater } from "../hooks/useUpdater";
import { isAutoCheckDue, markChecked, readUpdaterSettings } from "../utils/updaterSettings";
import { UpdaterContext } from "./UpdaterProvider";

/**
 * Desktop-only updater state machine and background launch check.
 * Loaded lazily in `desktop` builds so web and iOS bundles stay lean.
 */
const DesktopUpdaterProvider = ({ children }) => {
  const updater = useUpdater();
  const { supported, check } = updater;

  useEffect(() => {
    if (!supported) return;
    if (!isAutoCheckDue(readUpdaterSettings())) return;
    check().finally(markChecked);
  }, [supported, check]);

  return <UpdaterContext.Provider value={updater}>{children}</UpdaterContext.Provider>;
};

DesktopUpdaterProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export default DesktopUpdaterProvider;
