/* global self, caches, URL, fetch, Response, console */
const CACHE_NAME = "arctester-shell-v1";
const SHELL_URLs = [
  "/",
  "/index.html",
  "./assets/index-BXAiU6kN.js",
  "./assets/index-qUxFqUR5.css",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

// Install: cache the shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_URLs).catch((err) => {
        console.warn("Service worker: failed to cache shell", err);
      });
    })
  );
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
});

// Fetch: serve from cache for shell, network for exam content
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Shell assets: cache-first
  if (
    url.pathname === "/" ||
    url.pathname === "/index.html" ||
    url.pathname === "/manifest.json" ||
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/icon-")
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(event.request).then((response) => {
          if (!response || response.status !== 200) {
            return response;
          }
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }

  // Exam routes (/exams/...): network-first, no offline fallback
  if (url.pathname.startsWith("/exams/")) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({
            error: "Offline",
            message: "Exams require an internet connection. Exams cannot be taken offline.",
          }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" },
          }
        );
      })
    );
    return;
  }

  // All other requests: network-first
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});

// Listen for messages from the client
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
