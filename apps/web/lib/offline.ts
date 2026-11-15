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
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.(total ? received / total : -1);
  }

  const blob = new Blob(chunks as BlobPart[], { type: "audio/mpeg" });
  const cache = await caches.open(AUDIO_CACHE);
  await cache.put(
    audioKey(track.id),
    new Response(blob, {
      status: 200,
      headers: { "Content-Type": "audio/mpeg", "Content-Length": String(blob.size), "Accept-Ranges": "bytes" },
    }),
  );
  const meta: OfflineEntry = {
    id: track.id,
    name: track.name,
    duration: track.duration ?? 0,
    bytes: blob.size,
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

export async function removeOffline(id: string): Promise<void> {
  if (!offlineSupported()) return;
  const cache = await caches.open(AUDIO_CACHE);
  await cache.delete(audioKey(id));
  await cache.delete(metaKey(id));
}
