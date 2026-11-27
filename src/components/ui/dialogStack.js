import { useSyncExternalStore } from "react";

/**
 * Counts the dialogs and sheets on screen, so the layout can step aside while
 * one is open (the native tab bar in the iPhone Duo vertical bar would
 * otherwise sit on top of their buttons). Kept apart from `dialog.jsx` so the
 * layout can read it without loading the dialog library.
 */
let openDialogs = 0;
const listeners = new Set();

const notify = () => listeners.forEach((listener) => listener());

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Registers one open dialog; returns the function that releases it. */
export const trackOpenDialog = () => {
  openDialogs += 1;
  notify();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    openDialogs -= 1;
    notify();
  };
};

/** True while at least one dialog or sheet is on screen. */
export const useAnyDialogOpen = () => useSyncExternalStore(subscribe, () => openDialogs > 0, () => false);
