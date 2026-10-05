import createMiddleware from "next-intl/middleware";

import { routing } from "@/i18n/routing";

/**
 * Proxy (formerly Middleware -- renamed in Next.js 16).
 *
 * Responsibility is deliberately narrow: negotiate the locale and rewrite the
 * request onto the `[locale]` segment. Authorization is *not* done here --
 * proxy runs before the cache and cannot be a session authority, so route
 * protection lives in the server components and actions that read the session.
 */
export default createMiddleware(routing);

export const config = {
  /**
   * Skip Next internals, the API surface and anything with a file extension.
   * Matching on the absence of a dot keeps static assets out of the proxy
   * without having to enumerate every extension the app will ever serve.
   */
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
