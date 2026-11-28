const CACHE_NAME = "ducat-app-shell-v1";
const SHELL_KEY = "/index.html";

// Cache only the application shell and versioned static assets. Account data
// continues to be handled by the application's encrypted offline storage.
const saveShell = async (response) => {
  if (!response.ok || new URL(response.url).origin !== self.location.origin || !response.headers.get("content-type")?.includes("text/html")) return response;
  const html = await response.clone().text();
  const urls = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map((match) => match[1]);
  const cache = await caches.open(CACHE_NAME);
  try {
    await Promise.all(urls.map(async (url) => {
      const asset = await fetch(url);
      if (!asset.ok) throw new Error("Application asset unavailable");
      await cache.put(url, asset);
    }));
    await cache.put(SHELL_KEY, response.clone());
  } catch {
    // Keep the previous complete shell if a deployment is still in progress.
  }
  return response;
};

self.addEventListener("install", (event) => {
  event.waitUntil(fetch("/").then(saveShell).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(saveShell).catch(async () => (await caches.open(CACHE_NAME)).match(SHELL_KEY)));
    return;
  }
  if (!url.pathname.startsWith("/assets/")) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  })());
});
