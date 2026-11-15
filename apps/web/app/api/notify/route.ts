import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import nodemailer from "nodemailer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/notify: sends an email through Gmail. Called only by our API server (which cannot send
 * mail itself: Render's free plan blocks SMTP). Protected by a shared secret header.
 *
 * Env (web app): NOTIFY_SECRET, GMAIL_USER, GMAIL_APP_PASSWORD (a Google "app password").
 */

const MAX_PER_HOUR = 30;
let windowStart = Date.now();
let sentInWindow = 0;

function secretOk(received: string | null): boolean {
  const expected = process.env.NOTIFY_SECRET ?? "";
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!secretOk(req.headers.get("x-notify-secret"))) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    return NextResponse.json({ message: "Mail is not configured" }, { status: 503 });
  }

  // Even with the secret, never send more than a few dozen mails an hour.
  if (Date.now() - windowStart > 3_600_000) {
    windowStart = Date.now();
    sentInWindow = 0;
  }
  if (sentInWindow >= MAX_PER_HOUR) {
    return NextResponse.json({ message: "Rate limit" }, { status: 429 });
  }

  let body: { to?: unknown; subject?: unknown; html?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  const { to, subject, html } = body;
  if (
    typeof to !== "string" || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(to) ||
    typeof subject !== "string" || subject.length === 0 || subject.length > 200 ||
    typeof html !== "string" || html.length === 0 || html.length > 50_000
  ) {
    return NextResponse.json({ message: "Invalid mail" }, { status: 400 });
  }

  // Reserve the slot before the (slow) send so parallel requests cannot all slip under the limit.
  sentInWindow++;
  try {
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
    });
    await transport.sendMail({ from: `"מסמך לאודיו" <${user}>`, to, subject, html });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[notify] send failed:", (err as Error).message);
    return NextResponse.json({ message: "Send failed" }, { status: 502 });
  }
}
