import { useEffect, useState } from "react";
import { useUpdater } from "../../hooks/useUpdater";
import UpdaterDialog from "./UpdaterDialog";

/**
 * Runs a single background update check when the desktop app starts and shows
 * the prompt only when a newer version is actually available. A no-op in the
 * web runtime.
 */
const DesktopUpdateNotifier = () => {
  const updater = useUpdater();
  const { supported, check, status, reset } = updater;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (supported) check();
  }, [supported, check]);

  useEffect(() => {
    if (status === "available") setOpen(true);
  }, [status]);

  if (!supported) return null;

  const handleClose = () => {
    setOpen(false);
    reset();
  };

  return <UpdaterDialog open={open} onClose={handleClose} updater={updater} />;
};

export default DesktopUpdateNotifier;
