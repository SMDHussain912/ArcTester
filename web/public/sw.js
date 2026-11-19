/* ArcTester service worker: network-first app shell, cache-first versioned assets. */
const CACHE_NAME = "arctester-shell-v2";
const SHELL_URLS = ["/", "/index.html", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch((error) => console.warn("Service worker: shell cache skipped", error))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("arctester-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Always ask the server for the latest HTML. Fall back to the cached shell
  // only when offline, so deployments cannot get stuck on an old index.html.
  if (request.mode === "navigate" || url.pathname === "/" || url.pathname === "/index.html") {
    event.respondWith(
      fetch(request).then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", copy));
        }
        return response;
      }).catch(async () => (await caches.match("/index.html")) || (await caches.match("/")) || Response.error())
    );
    return;
  }

  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icon-") || url.pathname === "/manifest.json") {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      }))
    );
    return;
  }

  if (url.pathname.startsWith("/exams/")) {
    event.respondWith(fetch(request).catch(() => new Response(
      JSON.stringify({ error: "Offline", message: "Exams require an internet connection. Exams cannot be taken offline." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    )));
    return;
  }

  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
