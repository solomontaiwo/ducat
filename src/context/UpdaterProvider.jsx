import { createContext, useContext, useEffect } from "react";
import PropTypes from "prop-types";
import { useUpdater } from "../hooks/useUpdater";
import { isAutoCheckDue, markChecked, readUpdaterSettings } from "../utils/updaterSettings";

const UpdaterContext = createContext(null);

/** Shared updater state, so the page and any prompt stay in sync. */
export const useUpdaterContext = () => useContext(UpdaterContext);

/**
 * Owns the updater state machine and runs a background check on launch,
 * honouring the user's auto-check and frequency settings (desktop only).
 */
export const UpdaterProvider = ({ children }) => {
  const updater = useUpdater();
  const { supported, check } = updater;

  useEffect(() => {
    if (!supported) return;
    if (!isAutoCheckDue(readUpdaterSettings())) return;
    check().finally(markChecked);
  }, [supported, check]);

  return <UpdaterContext.Provider value={updater}>{children}</UpdaterContext.Provider>;
};

UpdaterProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export default UpdaterProvider;
