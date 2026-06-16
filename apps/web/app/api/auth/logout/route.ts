import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/session";

/**
 * Clears the auth cookie and redirects to /login. Used both for explicit
 * sign-out and for recovering from an expired/invalid token detected during
 * a server render (where cookies cannot be mutated directly).
 */
export async function GET(request: Request) {
  const url = new URL("/login", request.url);
  const res = NextResponse.redirect(url);
  res.cookies.delete(AUTH_COOKIE);
  return res;
}
