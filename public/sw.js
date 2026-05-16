// 簡易 Service Worker：靜態資源 cache-first，HTML / API 永遠 network-first
const CACHE = "erp-v2";
const STATIC_PREFIX = ["/_next/static/", "/icon-192", "/icon-512"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // API / page → network-first
  if (url.pathname.startsWith("/api/") || req.headers.get("accept")?.includes("text/html")) {
    e.respondWith(
      fetch(req).catch(() => caches.match(req).then((r) => r || new Response("離線中", { status: 503 })))
    );
    return;
  }
  // 靜態資源 cache-first
  if (STATIC_PREFIX.some((p) => url.pathname.startsWith(p))) {
    e.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        });
      })
    );
  }
});
