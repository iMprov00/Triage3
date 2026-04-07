/* TriagV3 — кеш статики; HTML-страницы не перехватываем */
var CACHE_NAME = 'triag-static-v1';
var PRECACHE_URLS = [
  '/css/app.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
  'https://code.jquery.com/jquery-3.6.4.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_URLS).catch(function () {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CACHE_NAME && key.indexOf('triag-static') === 0) {
            return caches.delete(key);
          }
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function shouldHandleRequest(req) {
  if (req.method !== 'GET') return false;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    return PRECACHE_URLS.indexOf(req.url) !== -1;
  }
  if (url.pathname === '/css/app.css') return true;
  if (url.pathname.indexOf('/js/') === 0 && url.pathname.endsWith('.js')) return true;
  return false;
}

self.addEventListener('fetch', function (event) {
  if (!shouldHandleRequest(event.request)) return;

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (response) {
        if (!response || response.status !== 200) return response;
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, copy);
        });
        return response;
      });
    })
  );
});
