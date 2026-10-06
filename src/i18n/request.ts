import { getRequestConfig } from "next-intl/server";
import { locale as localeRootParam } from "next/root-params";

import { getLocaleDefinition, resolveLocale, type Locale } from "@/config/locales";
import { PLATFORM_TIME_ZONE } from "@/config/time";

/**
 * Per-request i18n configuration.
 *
 * The active locale is taken from the `[locale]` root param rather than the
 * deprecated `requestLocale`. An explicit override still wins, which is what
 * server-side calls such as `getTranslations({ locale: "fr" })` rely on.
 *
 * Note: `next/root-params` is not yet available inside Route Handlers, so any
 * handler that needs translations must pass an explicit locale.
 */
async function resolveActiveLocale(override: string | undefined): Promise<Locale> {
  if (override) return resolveLocale(override);
  return resolveLocale(await localeRootParam());
}

async function loadMessages(locale: Locale) {
  // Static relative import so the bundler can statically analyse and split
  // each catalogue, rather than pulling every language into one chunk.
  const messages = await import(`../messages/${locale}.json`);
  return messages.default;
}

export default getRequestConfig(async ({ locale }) => {
  const active = await resolveActiveLocale(locale);
  const definition = getLocaleDefinition(active);

  return {
    locale: active,
    messages: await loadMessages(active),
    /**
     * `locale` above must stay one of the routing locales, so next-intl's own
     * formatters key off the bare language code. Where regional correctness
     * matters -- prices, invoice dates, build deadlines -- the formatter
     * utilities use `LocaleDefinition.intlTag` ("en-CA", "fr-CA") directly.
     */
    formats: {
      dateTime: {
        short: { day: "numeric", month: "short", year: "numeric" },
        long: { dateStyle: "long", timeStyle: "short" },
      },
      number: {
        integer: { maximumFractionDigits: 0 },
      },
    },
    /**
     * The *fallback* zone, not an assumption about the reader.
     *
     * This config is built for every request including anonymous marketing
     * pages, so resolving the signed-in viewer's zone here would add a session
     * lookup and a query to pages that render no timestamps at all. Anything
     * that shows a real timestamp goes through `viewerDates` / `viewerPresentation`
     * instead, which read the zone from the account.
     */
    timeZone: PLATFORM_TIME_ZONE,
    /**
     * A missing translation is a bug, not a runtime failure: surface it in
     * development and during tests, stay quiet in production, and always fall
     * back to rendering the key path rather than throwing.
     */
    onError(error) {
      if (process.env.NODE_ENV !== "production") {
        console.error(`[i18n:${definition.code}]`, error.message);
      }
    },
    getMessageFallback({ key, namespace }) {
      return namespace ? `${namespace}.${key}` : key;
    },
  };
});
