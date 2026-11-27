/**
 * Native pull to refresh in the iOS app (`NativeRefreshPlugin.swift`): the
 * system refresh control on the WebView's scroll view, as in the App Store.
 *
 * Pages register while they are on screen and able to refresh; the control is
 * on only while one is registered. A pull calls the most recent page, and the
 * spinner stays until its refresh settles. Outside the iOS app, or when the
 * plugin reports it is not available (the iPad app on a Mac), every call is a
 * no-op and the web pull to refresh is used instead.
 */

import { MOBILE, runtime } from "./index.js";

/** Keeps the spinner long enough to read as a refresh, even with cached data. */
export const MIN_REFRESH_MS = 450;

let pluginPromise = null;
let queue = Promise.resolve();
let listening = false;
let refreshing = false;
let sentEnabled = false;
let available = null;
const owners = new Map();
const availabilityListeners = new Set();

const getPlugin = () => {
  if (runtime() !== MOBILE) return null;
  // The plugin proxy answers every property, `then` included: wrap it so the
  // promise does not treat it as a thenable.
  pluginPromise ??= import("@capacitor/core").then(({ registerPlugin }) => ({ plugin: registerPlugin("NativeRefresh") }));
  return pluginPromise;
};

const setAvailable = (value) => {
  if (available === value) return;
  available = value;
  availabilityListeners.forEach((listener) => listener());
};

/** Runs native calls one after the other, in the order they were made. */
const enqueue = (task) => {
  const pending = getPlugin();
  if (!pending) return Promise.resolve();
  queue = queue.then(() => pending).then(({ plugin }) => task(plugin)).catch(() => setAvailable(false));
  return queue;
};

const sync = () => {
  // Stay on while a refresh runs, even if its page stops accepting new ones.
  const enabled = owners.size > 0 || refreshing;
  if (enabled === sentEnabled) return;
  sentEnabled = enabled;
  enqueue(async (plugin) => {
    const result = await plugin.setEnabled({ enabled });
    setAvailable(Boolean(result?.available));
  });
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const handleRefresh = async () => {
  const owner = [...owners.values()].at(-1);
  refreshing = true;
  const started = Date.now();
  try {
    await owner?.refresh();
  } catch {
    // The page reports its own errors; the spinner must still stop.
  } finally {
    const remaining = MIN_REFRESH_MS - (Date.now() - started);
    if (remaining > 0) await wait(remaining);
    refreshing = false;
    enqueue((plugin) => plugin.endRefreshing());
    sync();
  }
};

const listen = () => {
  if (listening) return;
  listening = true;
  enqueue((plugin) => plugin.addListener("refresh", () => { handleRefresh(); }));
};

/**
 * Turns the native control on for `refresh` until the returned function is
 * called. Does nothing outside the iOS app.
 */
export const registerNativeRefresh = (refresh) => {
  if (runtime() !== MOBILE) return () => {};
  listen();
  const token = Symbol("refresh");
  owners.set(token, { refresh });
  sync();
  return () => {
    owners.delete(token);
    sync();
  };
};

/** False outside the iOS app, or once the plugin says it cannot help. */
export const isNativeRefreshAvailable = () => runtime() === MOBILE && available !== false;

export const subscribeNativeRefreshAvailability = (listener) => {
  availabilityListeners.add(listener);
  return () => availabilityListeners.delete(listener);
};
