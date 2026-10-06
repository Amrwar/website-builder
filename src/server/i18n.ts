import "server-only";

import { getLocaleDefinition, resolveLocale, type Locale } from "@/config/locales";
import { resolveTimeZone } from "@/config/time";
import {
  createDateFormatters,
  type DateFormatterOptions,
  type DateFormatters,
} from "@/lib/i18n/datetime";
import { BASE_CURRENCY, type Currency } from "@/lib/pricing/money";
import { getAuthContext } from "@/server/auth";

/**
 * How the platform should present itself to whoever is reading this request.
 *
 * Three separate things, deliberately resolved from three separate places:
 *
 *  - **Language** comes from the URL. It has to: the locale is a route segment,
 *    so a French URL must render French regardless of what the account says,
 *    otherwise a shared link shows the recipient the wrong language and the
 *    locale switcher cannot work.
 *  - **Time zone** comes from `users.timezone`. The server runs in UTC and the
 *    reader almost never does.
 *  - **Display currency** comes from `users.preferredCurrency`, and is for
 *    *display of balances and plans only*. An order's own currency is part of
 *    its pricing snapshot and is never re-rendered in the viewer's preference.
 *
 * Signed out, the last two fall back to the platform's own, which is a stated
 * default rather than a guess about the reader.
 *
 * `getAuthContext` is memoised per request, so calling this from a page that
 * already authenticated costs nothing.
 */
export interface ViewerPresentation {
  locale: Locale;
  /** Full BCP 47 tag for `Intl`. */
  intlTag: string;
  timeZone: string;
  /** For balances and plan prices. Never for an order that has its own. */
  currency: Currency;
  /** True when the zone and currency are the account's, not the fallback. */
  personalised: boolean;
}

export async function viewerPresentation(
  localeParam: unknown,
): Promise<ViewerPresentation> {
  const locale = resolveLocale(localeParam);
  const { intlTag } = getLocaleDefinition(locale);
  const context = await getAuthContext();

  return {
    locale,
    intlTag,
    timeZone: resolveTimeZone(context?.user.timezone),
    currency: context?.user.preferredCurrency ?? BASE_CURRENCY,
    personalised: context !== null,
  };
}

/**
 * The common case: date formatters bound to this viewer's locale and zone.
 *
 * Pages take this instead of building `Intl.DateTimeFormat` inline, because an
 * inline one has no `timeZone` and therefore renders in the server's.
 */
export async function viewerDates(
  localeParam: unknown,
  options?: DateFormatterOptions,
): Promise<DateFormatters> {
  const { intlTag, timeZone } = await viewerPresentation(localeParam);
  return createDateFormatters({ intlTag, timeZone }, options);
}
