import { defineRouting } from "next-intl/routing";

import { DEFAULT_LOCALE, LOCALES } from "@/config/locales";

/**
 * Routing configuration shared by the proxy, the navigation helpers and the
 * request config.
 *
 * `localePrefix: "as-needed"` keeps canonical English URLs clean (`/pricing`
 * rather than `/en/pricing`) while French and Arabic carry an explicit prefix.
 * The `[locale]` segment still exists internally for every request because the
 * proxy rewrites unprefixed paths, so `next/root-params` resolves either way.
 *
 * Localised pathnames (e.g. `/fr/tarifs`) can be added here via `pathnames`
 * once the route surface is settled; nothing downstream needs to change.
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "as-needed",
  /**
   * Persist an explicit locale choice so a returning visitor is not re-matched
   * against their browser header on every visit.
   */
  localeCookie: {
    name: "PLATFORM_LOCALE",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  },
});
