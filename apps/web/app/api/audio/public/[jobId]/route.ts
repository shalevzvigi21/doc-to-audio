import { type NextRequest, NextResponse } from "next/server";
import { API_INTERNAL_URL } from "@/lib/session";

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } },
) {
  const upstream = await fetch(
    `${API_INTERNAL_URL}/audio/public/${params.jobId}`,
    {
      headers: { range: req.headers.get("range") ?? "" },
    },
  );

  const headers: Record<string, string> = {
    "Content-Type": upstream.headers.get("Content-Type") ?? "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600",
  };
  const contentRange = upstream.headers.get("Content-Range");
  if (contentRange) headers["Content-Range"] = contentRange;
  const contentLength = upstream.headers.get("Content-Length");
  if (contentLength) headers["Content-Length"] = contentLength;

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
