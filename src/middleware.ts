import { NextResponse, type NextRequest } from "next/server";

import { ACCESS_COOKIE } from "@/server/auth/session";
import { verifyToken } from "@/server/auth/tokens";

/**
 * Coarse route protection.
 *
 * This is a redirect, not an authorisation check, and the distinction matters.
 * Middleware runs on the Edge runtime with no database, so all it can establish
 * is that a validly-signed access token is present. It cannot know whether the
 * account still exists, has been suspended, or is still a reviewer.
 *
 * So its only job is to spare a signed-out visitor a flash of an empty
 * dashboard before a client-side redirect. Every real decision is made
 * server-side by `requireUser` / `requireAdmin` against the live row, and every
 * protected page and route calls one of those regardless of what happened here.
 * Removing this file would cost some polish and no security.
 *
 * `jose` is used rather than a Node JWT library precisely because it runs here:
 * it is built on Web Crypto, which the Edge runtime provides.
 */
const PROTECTED_PREFIXES = ["/dashboard", "/report", "/notifications", "/settings", "/review"];

/** Signing in again from these makes no sense, so an authenticated visitor is moved on. */
const AUTHENTICATED_REDIRECTS = ["/login", "/register", "/forgot-password"];

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  const claims = token ? await verifyToken(token, "access") : null;
  const looksSignedIn = claims !== null;

  if (!looksSignedIn && PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Carried so signing in returns the visitor to what they were trying to
    // reach. Only ever a path from this same request, so it cannot be used to
    // aim the post-login redirect at another origin.
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  if (looksSignedIn && AUTHENTICATED_REDIRECTS.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Runs on pages only.
   *
   * API routes are excluded on purpose: they answer with a 401 rather than a
   * redirect, and a middleware redirect in front of one turns a clean status
   * code into a 307 pointing at an HTML page — which is what makes a `fetch`
   * fail with a JSON parse error instead of the error it was given.
   */
  matcher: [
    "/dashboard/:path*",
    "/report/:path*",
    "/notifications/:path*",
    "/settings/:path*",
    "/review/:path*",
    "/login",
    "/register",
    "/forgot-password",
  ],
};
