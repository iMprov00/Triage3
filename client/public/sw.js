/* TriagV3 PWA: статика — stale-while-revalidate; API не кешируем */
const STATIC = "triag-client-static-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => {
          if (k !== STATIC && k.startsWith("triag-client")) return caches.delete(k);
        }),
      ),
    ).then(() => self.clients.claim()),
  );
});

function isApi(req) {
  try {
    const u = new URL(req.url);
    return u.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (isApi(req)) return;

  event.respondWith(
    caches.open(STATIC).then((cache) =>
      cache.match(req).then((cached) => {
        const net = fetch(req)
          .then((res) => {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || net;
      }),
    ),
  );
});
