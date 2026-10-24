import { type NextRequest, NextResponse } from "next/server";
import { API_INTERNAL_URL, getToken } from "@/lib/session";

/** Proxy POST /api/openai/sample → API POST /tts/sample. Returns the audio (or the API's JSON error). */
export async function POST(req: NextRequest) {
  const token = getToken();
  if (!token) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid request" }, { status: 400 });
  }

  try {
    const res = await fetch(`${API_INTERNAL_URL}/tts/sample`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      return new NextResponse(await res.text(), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new NextResponse(await res.arrayBuffer(), {
      status: 200,
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ message: "API unreachable" }, { status: 502 });
  }
}
