import { type NextRequest, NextResponse } from "next/server";
import { API_INTERNAL_URL, getToken } from "@/lib/session";

export async function GET(
  _req: NextRequest,
  { params }: { params: { fileId: string } },
) {
  const token = getToken();
  if (!token) return new NextResponse("Unauthorized", { status: 401 });

  const upstream = await fetch(
    `${API_INTERNAL_URL}/files/${params.fileId}/source`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );

  if (!upstream.ok) {
    return new NextResponse("Not found", { status: upstream.status });
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/octet-stream",
      "Content-Disposition": upstream.headers.get("Content-Disposition") ?? "inline",
    },
  });
}
