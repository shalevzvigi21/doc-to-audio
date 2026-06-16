import { NextResponse } from "next/server";
import { API_INTERNAL_URL, getToken } from "@/lib/session";

/**
 * Proxy GET /api/tts/quota → API GET /tts/quota, injecting the Bearer token
 * from the httpOnly cookie so the browser can poll the Gemini daily budget.
 */
export async function GET() {
  const token = getToken();
  if (!token) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  const res = await fetch(`${API_INTERNAL_URL}/tts/quota`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
