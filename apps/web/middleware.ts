import { NextResponse, type NextRequest } from "next/server";

const AUTH_COOKIE = "auth_token";
const PROTECTED_PREFIXES = ["/library", "/player"];
const AUTH_PAGES = ["/login", "/register"];

/**
 * Gate protected pages on the presence of the auth cookie, and bounce
 * already-signed-in users away from the login/register pages.
 * (The cookie's validity is enforced server-side by the API; this is a
 * fast UX redirect.)
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasToken = Boolean(request.cookies.get(AUTH_COOKIE)?.value);

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const isAuthPage = AUTH_PAGES.includes(pathname);

  if (isProtected && !hasToken) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthPage && hasToken) {
    const url = request.nextUrl.clone();
    url.pathname = "/library";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/library/:path*", "/player/:path*", "/login", "/register"],
};
