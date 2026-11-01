/*
 * Minimal service worker: it makes the web app installable (the manifest alone
 * is not enough in Chromium) without caching any data. Every request goes to
 * the network, so there is no stale UI after a deploy and no offline copy of
 * financial data on the device.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// A fetch handler is required for installability; not calling respondWith()
// lets the browser handle the request exactly as without a worker.
self.addEventListener("fetch", () => {});
