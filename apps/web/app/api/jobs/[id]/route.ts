import { NextResponse } from "next/server";
import { API_INTERNAL_URL, getToken } from "@/lib/session";

/**
 * Proxy GET /api/jobs/:id → API GET /jobs/:id, injecting the Bearer token
 * from the httpOnly cookie so the browser can poll job status.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const token = getToken();
  if (!token) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  const res = await fetch(`${API_INTERNAL_URL}/jobs/${params.id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
