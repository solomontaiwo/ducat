import { useCallback, useEffect, useRef, useState } from "react";
import {
  canSelfUpdate,
  checkForUpdates,
  downloadAndInstall,
  isDesktopRuntime,
  readBundleType,
  relaunch,
} from "../services/updaterService";

/**
 * Desktop updater state machine.
 *
 * status: idle | checking | available | downloading | downloaded | up-to-date | error
 *
 * `supported` is true only when the running bundle can replace itself (AppImage
 * on Linux, .app on macOS, NSIS on Windows). deb/rpm/pacman installs are owned
 * by the system package manager and must not call the updater.
 */
export function useUpdater() {
  const desktop = isDesktopRuntime();
  const [status, setStatus] = useState("idle");
  const [version, setVersion] = useState(null);
  const [notes, setNotes] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [bundleType, setBundleType] = useState(null);
  const [supported, setSupported] = useState(false);
  const [detectingSupport, setDetectingSupport] = useState(desktop);
  const updateRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    if (!desktop) {
      setSupported(false);
      setDetectingSupport(false);
      return undefined;
    }
    readBundleType()
      .then((type) => {
        if (cancelled) return;
        setBundleType(type);
        setSupported(canSelfUpdate(type));
      })
      .finally(() => {
        if (!cancelled) setDetectingSupport(false);
      });
    return () => { cancelled = true; };
  }, [desktop]);

  const check = useCallback(async () => {
    if (!isDesktopRuntime() || !supported) return;
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
  }, [supported]);

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

  return {
    desktop,
    bundleType,
    supported,
    detectingSupport,
    status,
    version,
    notes,
    progress,
    error,
    check,
    install,
    restart,
    reset,
  };
}
