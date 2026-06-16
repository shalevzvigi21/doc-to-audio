import "server-only";
import { cookies } from "next/headers";

/** Name of the httpOnly cookie that stores the API JWT. */
export const AUTH_COOKIE = "auth_token";

/** Base URL the server uses to reach the API (server-to-server). */
export const API_INTERNAL_URL =
  process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Read the JWT from the httpOnly cookie, or null if not signed in. */
export function getToken(): string | null {
  return cookies().get(AUTH_COOKIE)?.value ?? null;
}

const SEVEN_DAYS = 60 * 60 * 24 * 7;

/** Persist the JWT in an httpOnly, same-site cookie. */
export function setAuthCookie(token: string): void {
  cookies().set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SEVEN_DAYS,
  });
}

/** Remove the auth cookie (logout). */
export function clearAuthCookie(): void {
  cookies().delete(AUTH_COOKIE);
}
