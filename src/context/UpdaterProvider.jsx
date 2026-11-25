import { createContext, lazy, Suspense, useContext } from "react";
import PropTypes from "prop-types";

const NOOP_ASYNC = async () => {};
const NOOP = () => {};

const INERT_UPDATER = Object.freeze({
  desktop: false,
  runtime: null,
  bundleType: null,
  supported: false,
  blockReason: null,
  detectingSupport: false,
  status: "idle",
  version: null,
  notes: null,
  progress: 0,
  error: null,
  check: NOOP_ASYNC,
  install: NOOP_ASYNC,
  restart: NOOP_ASYNC,
  reset: NOOP,
});

export const UpdaterContext = createContext(INERT_UPDATER);

/** Shared updater state, so the page and any prompt stay in sync. */
export const useUpdaterContext = () => useContext(UpdaterContext);

const DesktopUpdaterProvider = import.meta.env.MODE === "desktop"
  ? lazy(() => import("./DesktopUpdaterProvider"))
  : null;

/**
 * Provides updater state. On web and mobile the desktop updater machinery is
 * never loaded, saving bundle budget and keeping the startup path lean.
 */
export const UpdaterProvider = ({ children }) => {
  if (!DesktopUpdaterProvider) {
    return <UpdaterContext.Provider value={INERT_UPDATER}>{children}</UpdaterContext.Provider>;
  }
  return (
    <Suspense fallback={<UpdaterContext.Provider value={INERT_UPDATER}>{children}</UpdaterContext.Provider>}>
      <DesktopUpdaterProvider>{children}</DesktopUpdaterProvider>
    </Suspense>
  );
};

UpdaterProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export default UpdaterProvider;
