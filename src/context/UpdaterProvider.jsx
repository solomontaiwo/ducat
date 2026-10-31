import { createContext, useContext, useEffect } from "react";
import PropTypes from "prop-types";
import { useUpdater } from "../hooks/useUpdater";

const UpdaterContext = createContext(null);

/** Shared updater state, so the icon, the profile entry and any prompt stay in sync. */
export const useUpdaterContext = () => useContext(UpdaterContext);

/**
 * Owns the updater state machine and runs a background check once on launch
 * (desktop only). Consumers read the result and trigger install/restart.
 */
export const UpdaterProvider = ({ children }) => {
  const updater = useUpdater();
  const { supported, check } = updater;

  useEffect(() => {
    if (supported) check();
  }, [supported, check]);

  return <UpdaterContext.Provider value={updater}>{children}</UpdaterContext.Provider>;
};

UpdaterProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export default UpdaterProvider;
