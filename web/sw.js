// 간단한 오프라인 캐시용 서비스 워커
const CACHE = "date-course-v15";
const ASSETS = [
  "./", "./index.html", "./styles.css", "./app.js",
  "./js/api.js", "./js/config.js", "./js/storage.js", "./js/map.js", "./js/geo.js", "./js/share.js",
  "./icon.svg", "./icon-192.png", "./icon-512.png", "./icon-180.png", "./manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
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
  if (request.url.includes("/api/")) {
    e.respondWith(fetch(request).catch(() => new Response("{}", { status: 503 })));
    return;
  }
  e.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});
