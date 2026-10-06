import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { LOCALES } from "@/config/locales";
import { routing } from "@/i18n/routing";

/**
 * Proxy (formerly Middleware -- renamed in Next.js 16).
 *
 * Two jobs, in order: establish the Clerk session, then negotiate the locale
 * and rewrite onto the `[locale]` segment.
 *
 * What this is NOT is the authorization boundary. The proxy runs before the
 * cache and only sees the request, so it can answer "is there a session?" but
 * not "may this person read this record?". It is a coarse gate that keeps
 * signed-out traffic off private routes; every real decision is re-made
 * server-side in `@/server/auth`, which reads the role from the database.
 */

const localePrefix = `/(${LOCALES.join("|")})`;

/**
 * Private areas, matched both with and without a locale prefix because
 * `localePrefix: "as-needed"` means English URLs carry no prefix.
 *
 * The segment and its subtree are listed separately rather than as
 * `/account(.*)`: that form has no boundary after the word, so it also claims
 * `/accounts-payable` and `/administrators` and would force a sign-in on a
 * public page that merely starts with the same letters.
 */
const PRIVATE_SEGMENTS = ["account", "admin", "billing", "orders", "projects"] as const;

const isPrivateRoute = createRouteMatcher(
  PRIVATE_SEGMENTS.flatMap((segment) => [
    `/${segment}`,
    `/${segment}/(.*)`,
    `${localePrefix}/${segment}`,
    `${localePrefix}/${segment}/(.*)`,
  ]),
);

const handleI18n = createMiddleware(routing);

/**
 * Where a signed-out visitor is sent, in their own language.
 *
 * Without this Clerk falls back to its hosted account portal on a
 * *.accounts.dev domain -- which works, but hands the visitor off to a
 * different-looking site mid-journey and bypasses the sign-in page this
 * application actually ships. Passing the URL explicitly also means the
 * behaviour is in code rather than in an environment variable that can be
 * present locally and missing in production.
 */
function signInUrlFor(request: NextRequest): string {
  const { pathname, origin, href } = request.nextUrl;

  // `localePrefix: "as-needed"` means English URLs carry no prefix, so the
  // prefix is only reinstated when the request actually had one.
  const [, candidate] = /^\/([^/]+)/.exec(pathname) ?? [];
  const prefix = LOCALES.includes(candidate as (typeof LOCALES)[number])
    ? `/${candidate}`
    : "";

  const url = new URL(`${prefix}/sign-in`, origin);
  // Set here rather than left to Clerk so the return path is predictable and
  // testable; Clerk preserves an existing `redirect_url`.
  url.searchParams.set("redirect_url", href);
  return url.toString();
}

export default clerkMiddleware(async (auth, request: NextRequest) => {
  const { pathname } = request.nextUrl;

  // API routes are not localised: they carry no `[locale]` segment and must
  // not be rewritten onto one. Their own handlers enforce authentication.
  if (pathname.startsWith("/api/")) return NextResponse.next();

  if (isPrivateRoute(request)) {
    // Redirects a signed-out visitor to our own sign-in page, preserving where
    // they were heading so they land there afterwards.
    await auth.protect({ unauthenticatedUrl: signInUrlFor(request) });
  }

  return handleI18n(request);
});

export const config = {
  /**
   * Skip Next internals and static assets, but DO include `/api` so Clerk can
   * attach the session to route handlers -- the handler itself still decides
   * whether a session is required.
   *
   * The file-extension exclusion is spelled out rather than written as
   * "anything containing a dot": a lookahead built from `.*\.` is one lost
   * backslash away from matching every path, which silently disables both
   * localisation and the signed-in gate.
   */
  matcher: [
    "/((?!_next/|_vercel/|favicon\\.ico|.*\\.(?:html?|css|js|json|map|txt|xml|webmanifest|png|jpe?g|gif|svg|webp|avif|ico|ttf|otf|woff2?)$).*)",
    "/api/(.*)",
  ],
};
