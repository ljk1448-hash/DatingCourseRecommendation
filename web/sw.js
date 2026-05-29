// 간단한 오프라인 캐시용 서비스 워커
const CACHE = "date-course-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./icon.svg",
  "./manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
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
  const { request } = e;
  // API 요청은 항상 네트워크
  if (request.url.includes("/api/")) {
    e.respondWith(fetch(request).catch(() => new Response("{}", { status: 503 })));
    return;
  }
  // 정적 자원은 캐시 우선
  e.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});
