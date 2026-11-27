/**
 * Native pull to refresh in the iOS app (`NativeRefreshPlugin.swift`): the
 * system refresh control on the WebView's scroll view, as in the App Store.
 *
 * Pages register while they are on screen and able to refresh; the control is
 * on only while one is registered. When the finger lifts past the threshold
 * the control springs back and the most recent page refreshes, showing its own
 * spinner (see `PullToRefresh`). Outside the iOS app, or when the plugin
 * reports it is not available (the iPad app on a Mac), every call is a no-op
 * and the web pull to refresh is used instead.
 */

import { MOBILE, runtime } from "./index.js";

let pluginPromise = null;
let queue = Promise.resolve();
let listening = false;
let refreshing = false;
let sentEnabled = false;
let sentOffset = 0;
let resizeListening = false;
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

const latestOwner = () => [...owners.values()].at(-1);

const sync = () => {
  const enabled = owners.size > 0;
  // Horizontal offset of the page's centre from the screen's, so the native
  // spinner sits over the content and not under a side bar.
  const offsetX = enabled ? Math.round(latestOwner()?.offset?.() ?? 0) : sentOffset;
  if (enabled === sentEnabled && offsetX === sentOffset) return;
  sentEnabled = enabled;
  sentOffset = offsetX;
  enqueue(async (plugin) => {
    const result = await plugin.setEnabled({ enabled, offsetX });
    setAvailable(Boolean(result?.available));
  });
};

const listenToResize = () => {
  if (resizeListening || typeof window === "undefined") return;
  resizeListening = true;
  let frame = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(sync);
  });
};

const handleRefresh = async () => {
  // A second pull while the page is still loading adds nothing.
  if (refreshing) return;
  const owner = latestOwner();
  if (!owner) return;
  refreshing = true;
  try {
    await owner.refresh();
  } catch {
    // The page reports its own errors.
  } finally {
    refreshing = false;
  }
};

const listen = () => {
  if (listening) return;
  listening = true;
  enqueue((plugin) => plugin.addListener("refresh", () => { handleRefresh(); }));
};

/**
 * Turns the native control on for `refresh` until the returned function is
 * called. `offset` returns how far right of the screen's centre the page's
 * centre is. Does nothing outside the iOS app.
 */
export const registerNativeRefresh = (refresh, offset) => {
  if (runtime() !== MOBILE) return () => {};
  listen();
  listenToResize();
  const token = Symbol("refresh");
  owners.set(token, { refresh, offset });
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
