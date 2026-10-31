import { useCallback, useRef, useState } from "react";
import { checkForUpdates, downloadAndInstall, isDesktopRuntime, relaunch } from "../services/updaterService";

/**
 * Desktop updater state machine.
 *
 * status: idle | checking | available | downloading | downloaded | up-to-date | error
 */
export function useUpdater() {
  const [status, setStatus] = useState("idle");
  const [version, setVersion] = useState(null);
  const [notes, setNotes] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const updateRef = useRef(null);

  const supported = isDesktopRuntime();

  const check = useCallback(async () => {
    if (!isDesktopRuntime()) return;
    setStatus("checking");
    setError(null);
    try {
      const update = await checkForUpdates();
      if (update) {
        updateRef.current = update;
        setVersion(update.version);
        setNotes(update.body ?? null);
        setProgress(0);
        setStatus("available");
      } else {
        updateRef.current = null;
        setStatus("up-to-date");
      }
    } catch (caught) {
      updateRef.current = null;
      setError(caught?.message ? String(caught.message) : String(caught));
      setStatus("error");
    }
  }, []);

  const install = useCallback(async () => {
    const update = updateRef.current;
    if (!update) return;
    setStatus("downloading");
    setError(null);
    setProgress(0);
    try {
      await downloadAndInstall(update, ({ downloaded, total }) => {
        const next = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;
        setProgress(next);
      });
      setProgress(100);
      setStatus("downloaded");
    } catch (caught) {
      setError(caught?.message ? String(caught.message) : String(caught));
      setStatus("error");
    }
  }, []);

  const restart = useCallback(async () => {
    try {
      await relaunch();
    } catch (caught) {
      setError(caught?.message ? String(caught.message) : String(caught));
      setStatus("error");
    }
  }, []);

  const reset = useCallback(() => {
    updateRef.current = null;
    setStatus("idle");
    setVersion(null);
    setNotes(null);
    setProgress(0);
    setError(null);
  }, []);

  return { supported, status, version, notes, progress, error, check, install, restart, reset };
}
