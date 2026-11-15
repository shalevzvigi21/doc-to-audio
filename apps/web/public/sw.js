/* Doc-to-Audio service worker.
 *
 * - Serves downloaded MP3s from the cache (including Range requests, which
 *   iOS and Android audio players always use), so they play with no network.
 * - Caches hashed /_next/static assets (cache-first).
 * - Navigations stay network-first and are NEVER cached (they contain private,
 *   per-user pages); when offline they fall back to /offline.html, which lists
 *   the downloaded documents.
 */
const VERSION = "v1";
const STATIC_CACHE = `static-${VERSION}`;
const SHELL_CACHE = `shell-${VERSION}`;
const AUDIO_CACHE = "audio-v1"; // keep in sync with lib/offline.ts; never deleted on upgrade

const SHELL_FILES = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png"];
const AUDIO_PATH = /^\/api\/audio\/[^/]+$/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== SHELL_CACHE && k !== AUDIO_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Answer a (possibly ranged) request from a cached full-length MP3. */
async function cachedAudioResponse(request, cached) {
  const rangeHeader = request.headers.get("range");
  if (!rangeHeader) return cached;

  const blob = await cached.blob();
  const size = blob.size;
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!m || (m[1] === "" && m[2] === "")) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }

  let start;
  let end;
  if (m[1] === "") {
    // suffix range: last N bytes
    const n = Number(m[2]);
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }

  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
    },
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Downloaded audio: cache first, otherwise let the network handle it untouched.
  if (AUDIO_PATH.test(url.pathname)) {
    event.respondWith(
      caches.open(AUDIO_CACHE).then(async (cache) => {
        const cached = await cache.match(url.pathname);
        if (cached) return cachedAudioResponse(request, cached);
        return fetch(request);
      }),
    );
    return;
  }

  // Hashed, immutable build assets.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  // Page loads: network only; offline page when there is no connection.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match("/offline.html")) || Response.error();
      }),
    );
  }
});
