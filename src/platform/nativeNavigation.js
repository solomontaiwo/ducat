/**
 * Native tab bar in the iPhone Duo "vertical bar" (`VerticalBarNavigation.swift`).
 *
 * On iOS 27.1+, when the system offers a vertical bar next to the status bar,
 * the app shows a native tab bar there and the web app hides its own bottom
 * navigation. Everywhere else — other iPhones, the Duo inner screen, web and
 * desktop, or an older app build without the plugin — `available` stays
 * false and nothing changes.
 */

import { MOBILE, runtime } from "./index.js";

let pluginPromise = null;

const getPlugin = () => {
  if (runtime() !== MOBILE) return null;
  // Loaded on demand so @capacitor/core stays out of the initial web bundle.
  // The plugin proxy answers every property, `then` included: wrap it, or the
  // promise would treat it as a thenable and call a native `then()`.
  pluginPromise ??= import("@capacitor/core").then(({ registerPlugin }) => ({ plugin: registerPlugin("NativeNavigation") }));
  return pluginPromise;
};

/**
 * Listens to the native tab bar. Returns an unsubscribe function.
 * `onAvailability(boolean)` reports whether the native bar replaces the web one.
 */
export const subscribeNativeNavigation = ({ onAvailability, onSelect, onAdd, onProfile }) => {
  const pending = getPlugin();
  if (!pending) return () => {};
  let active = true;
  const handles = [];
  pending.then(async ({ plugin }) => {
    const listen = async (event, handler) => {
      const handle = await plugin.addListener(event, handler);
      if (active) handles.push(handle);
      else handle.remove();
    };
    await Promise.all([
      listen("stateChanged", ({ available, profileNavigation }) => onAvailability(Boolean(available), Boolean(profileNavigation))),
      listen("tabSelected", ({ path }) => onSelect(path)),
      listen("addRequested", () => onAdd()),
      listen("profileRequested", () => onProfile?.()),
    ]);
    const { available, profileNavigation } = await plugin.getState();
    if (active) onAvailability(Boolean(available), Boolean(profileNavigation));
  }).catch(() => {
    // Older app builds have no NativeNavigation plugin: keep the web navigation.
    if (active) onAvailability(false);
  });
  return () => {
    active = false;
    handles.forEach((handle) => handle.remove());
  };
};

/** Sends the current navigation state to the native tab bar. */
export const updateNativeNavigation = (state) => {
  const pending = getPlugin();
  if (!pending) return Promise.resolve();
  return pending.then(({ plugin }) => plugin.update(state)).catch(() => {});
};
