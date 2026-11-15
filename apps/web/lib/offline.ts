/**
 * Offline listening: download a document's MP3 into the browser's Cache Storage.
 * public/sw.js answers /api/audio/<id> from this cache (including Range requests),
 * and public/offline.html lists the downloads when there is no connection.
 *
 * Cache layout (cache name must match public/sw.js):
 *   /api/audio/<id>    the full MP3 (a 200 response; the SW slices ranges itself)
 *   /__meta/<id>       JSON { id, name, duration, bytes, savedAt }
 */
export const AUDIO_CACHE = "audio-v1";

export interface OfflineEntry {
  id: string;
  name: string;
  duration: number;
  bytes: number;
  savedAt: number;
}

const audioKey = (id: string) => `/api/audio/${id}`;
const metaKey = (id: string) => `/__meta/${id}`;

export function offlineSupported(): boolean {
  return typeof window !== "undefined" && "caches" in window && "serviceWorker" in navigator;
}

export async function isOffline(id: string): Promise<boolean> {
  if (!offlineSupported()) return false;
  const cache = await caches.open(AUDIO_CACHE);
  return Boolean(await cache.match(metaKey(id)));
}

export async function listOffline(): Promise<OfflineEntry[]> {
  if (!offlineSupported()) return [];
  const cache = await caches.open(AUDIO_CACHE);
  const keys = await cache.keys();
  const metas = keys.filter((r) => new URL(r.url).pathname.startsWith("/__meta/"));
  const entries = await Promise.all(
    metas.map(async (r) => {
      const res = await cache.match(r);
      return (res ? ((await res.json()) as OfflineEntry) : null) as OfflineEntry | null;
    }),
  );
  return entries.filter((e): e is OfflineEntry => e !== null).sort((a, b) => b.savedAt - a.savedAt);
}

/**
 * Download the whole MP3. `onProgress` receives 0..1 (or -1 when the size is unknown).
 * The meta entry is written last, so a failed or aborted download is never listed.
 */
export async function downloadForOffline(
  track: { id: string; name: string; duration?: number | null },
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!offlineSupported()) throw new Error("Offline storage is not supported in this browser");

  const res = await fetch(audioKey(track.id), { cache: "no-store", signal });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);

  const total = Number(res.headers.get("content-length")) || 0;
  let received = 0;
  // Stream straight into the cache: the whole MP3 is never held in JS memory (a 50 MB
  // file twice over can get an iOS Safari tab killed).
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.length;
      onProgress?.(total ? received / total : -1);
      controller.enqueue(chunk);
    },
  });
  const cache = await caches.open(AUDIO_CACHE);
  const headers: Record<string, string> = { "Content-Type": "audio/mpeg", "Accept-Ranges": "bytes" };
  if (total) headers["Content-Length"] = String(total);
  await cache.put(audioKey(track.id), new Response(res.body.pipeThrough(counter), { status: 200, headers }));
  const meta: OfflineEntry = {
    id: track.id,
    name: track.name,
    duration: track.duration ?? 0,
    bytes: received,
    savedAt: Date.now(),
  };
  await cache.put(metaKey(track.id), new Response(JSON.stringify(meta), { headers: { "Content-Type": "application/json" } }));

  // Ask the browser not to evict the download under storage pressure (best effort).
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* not available */
  }
  onProgress?.(1);
}

/**
 * Delete every downloaded document. Cache Storage is per browser profile, not per user,
 * so this runs on logout and when a different account signs in; otherwise the next person
 * on a shared phone could list and play the previous user's downloads (also from offline.html).
 */
export async function purgeOffline(): Promise<void> {
  try {
    localStorage.removeItem(OWNER_KEY);
  } catch {
    /* storage blocked */
  }
  if (typeof window !== "undefined" && "caches" in window) {
    await caches.delete(AUDIO_CACHE);
  }
}

const OWNER_KEY = "offline-owner";

/** Remember who the downloads belong to; purge them when a different email signs in. */
export async function claimOfflineOwner(email: string): Promise<void> {
  const next = email.trim().toLowerCase();
  if (!next) return;
  let prev: string | null = null;
  try {
    prev = localStorage.getItem(OWNER_KEY);
  } catch {
    /* storage blocked */
  }
  if (prev && prev !== next) await purgeOffline();
  try {
    localStorage.setItem(OWNER_KEY, next);
  } catch {
    /* storage blocked */
  }
}

export async function removeOffline(id: string): Promise<void> {
  if (!offlineSupported()) return;
  const cache = await caches.open(AUDIO_CACHE);
  await cache.delete(audioKey(id));
  await cache.delete(metaKey(id));
}
