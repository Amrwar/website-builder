/**
 * Time zone defaults.
 *
 * The platform operates from Toronto, so that is the zone a deadline is quoted
 * in when we do not know the viewer's own. It is a *fallback*, never an
 * assumption: a signed-in customer's zone comes from `users.timezone` and is
 * what their dates render in.
 *
 * It is a constant rather than an inline string because it appears in three
 * unrelated places -- the schema default, the i18n request config and the
 * server-side viewer resolver -- and three copies drift.
 */
export const PLATFORM_TIME_ZONE = "America/Toronto";

/**
 * Validates an IANA zone against the runtime's own database rather than a
 * hardcoded list, so it cannot drift as zones are added or renamed.
 *
 * The `Intl.DateTimeFormat` constructor is the check, not
 * `Intl.supportedValuesOf("timeZone")`: that list omits "UTC" by specification
 * and omits legacy aliases such as "EST5EDT" that the constructor resolves to
 * a real zone, so using it as an allowlist rejects zones that work. The
 * constructor is strict enough to reject a bare language tag like "en".
 */
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Coerces untrusted input to a usable zone, falling back to the platform's. */
export function resolveTimeZone(value: unknown): string {
  return isTimeZone(value) ? value : PLATFORM_TIME_ZONE;
}
