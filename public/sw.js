/* Lineup Manager service worker - offline fallback only.
 *
 * It deliberately caches nothing from the app itself (no signed-in pages, no data), so it can
 * never show stale or someone else's content. Its one job: when a page can't be reached
 * (no signal, or a connection so weak it hangs), show /offline.html instead of the browser's
 * "no internet" error. That page reads the game-day copy the app saved on this phone.
 */
const CACHE = "lm-offline-shell-v1";
const OFFLINE_URL = "/offline.html";
const SLOW_NETWORK_MS = 8000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function refreshShell() {
  return fetch(new Request(OFFLINE_URL, { cache: "reload" }))
    .then((res) => (res.ok ? caches.open(CACHE).then((c) => c.put(OFFLINE_URL, res)) : undefined))
    .catch(() => {});
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate" || req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Let the offline page itself and the "try the live app" link through untouched.
  if (url.pathname === OFFLINE_URL) return;
  if (url.searchParams.has("live")) return;

  event.respondWith(
    new Promise((resolve) => {
      let settled = false;
      const fallback = () =>
        caches.match(OFFLINE_URL).then((cached) => cached || Response.error());
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        fallback().then(resolve);
      }, SLOW_NETWORK_MS);

      fetch(req)
        .then((res) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(res);
          event.waitUntil(refreshShell());
        })
        .catch(() => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          fallback().then(resolve);
        });
    }),
  );
});
