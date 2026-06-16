import { API_INTERNAL_URL, getToken } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Proxy GET /api/audio/:jobId → API GET /audio/:jobId, attaching the Bearer
 * token from the httpOnly cookie and forwarding the Range header so the
 * browser's <audio> element can seek. The API responds with 206 + Content-Range
 * for ranged requests, which we pass straight through.
 */
export async function GET(req: Request, { params }: { params: { jobId: string } }) {
  const token = getToken();
  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const range = req.headers.get("range");
  if (range) headers.Range = range;

  const upstream = await fetch(`${API_INTERNAL_URL}/audio/${params.jobId}`, {
    headers,
    cache: "no-store",
  });

  // Forward streaming body + the headers needed for ranged playback.
  const passthrough = new Headers();
  for (const key of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "cache-control",
  ]) {
    const value = upstream.headers.get(key);
    if (value) passthrough.set(key, value);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: passthrough,
  });
}
