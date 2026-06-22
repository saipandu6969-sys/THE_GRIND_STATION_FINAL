// The Grind Station — Service Worker (offline shell + asset cache)
const CACHE = "grindstation-v1";
const ASSETS = ["/", "/manifest.json", "/icon.svg", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => null)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Never cache API calls — always go to network
  if (url.pathname.startsWith("/api/")) return;

  // Navigation requests: network-first, fall back to cached root
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request).catch(() => caches.match("/").then((r) => r || new Response("Offline", { status: 503 })))
    );
    return;
  }

  // Static assets: cache-first
  if (request.method === "GET") {
    e.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((resp) => {
            if (resp && resp.ok && resp.type !== "opaque") {
              const clone = resp.clone();
              caches.open(CACHE).then((c) => c.put(request, clone)).catch(() => null);
            }
            return resp;
          }).catch(() => cached)
      )
    );
  }
});
