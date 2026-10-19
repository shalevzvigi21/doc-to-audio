import { NextResponse } from "next/server";
import { API_INTERNAL_URL, getToken } from "@/lib/session";

/** Proxy GET /api/diagnostics → API GET /me/diagnostics (adds the cookie's Bearer token). */
export async function GET() {
  const token = getToken();
  if (!token) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  try {
    const res = await fetch(`${API_INTERNAL_URL}/me/diagnostics`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return new NextResponse(await res.text(), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json({ message: "API unreachable" }, { status: 502 });
  }
}
