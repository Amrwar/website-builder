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
/**
 * Persist an explicit locale choice so a returning visitor is not re-matched
 * against their browser header on every visit.
 *
 * Exported separately from `routing` so the one other place that writes it --
 * saving the account's language preference, which otherwise could not affect
 * the UI at all, because the UI language comes from the URL -- writes the same
 * cookie with the same attributes rather than a second hand-copied name.
 */
export const LOCALE_COOKIE = {
  name: "PLATFORM_LOCALE",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax",
  path: "/",
} as const;

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "as-needed",
  localeCookie: LOCALE_COOKIE,
});
