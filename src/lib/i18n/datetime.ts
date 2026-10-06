import { PLATFORM_TIME_ZONE } from "@/config/time";

/**
 * Date and time formatting for one viewer.
 *
 * Every timestamp the platform shows is stored in UTC and must be rendered in
 * the *viewer's* zone. Before this module each page built its own
 * `new Intl.DateTimeFormat(intlTag, { dateStyle })` with no `timeZone` at all,
 * which silently means "the zone the Node process happens to run in" -- UTC in
 * production. A customer in Dubai reading a deadline of "12 March" was being
 * shown a date that could be a day out from the one we committed to, and a
 * build-queue timestamp late in the evening showed tomorrow's date.
 *
 * Construction is deliberately factored into a factory rather than a bare
 * `formatDate(value, locale, zone)` helper: tables call this once per row per
 * column, and `Intl.DateTimeFormat` is expensive enough that a fresh instance
 * per cell shows up in render time. The factory builds each style at most once.
 */
export interface TimeZoneContext {
  /** Full BCP 47 tag from the locale registry ("en-CA", "fr-CA", "ar"). */
  intlTag: string;
  /** IANA zone the dates are rendered in. */
  timeZone: string;
}

export type DateStyle = "short" | "medium" | "long";

export interface DateFormatters {
  /** A calendar date. `null` renders the fallback rather than "Invalid Date". */
  date(value: Date | null | undefined, style?: DateStyle): string;
  /** A date with the time of day, for anything where the hour carries meaning. */
  dateTime(value: Date | null | undefined, style?: DateStyle): string;
  /** The time of day alone. */
  time(value: Date | null | undefined): string;
  /** The zone everything above was rendered in, for an explicit disclosure. */
  timeZone: string;
}

export interface DateFormatterOptions {
  /** Shown instead of a date when the value is absent. */
  fallback?: string;
}

export function createDateFormatters(
  context: TimeZoneContext,
  options: DateFormatterOptions = {},
): DateFormatters {
  const { intlTag, timeZone } = context;
  const { fallback = "—" } = options;

  const cache = new Map<string, Intl.DateTimeFormat>();

  const formatterFor = (key: string, init: Intl.DateTimeFormatOptions) => {
    const existing = cache.get(key);
    if (existing) return existing;
    const created = new Intl.DateTimeFormat(intlTag, { ...init, timeZone });
    cache.set(key, created);
    return created;
  };

  const render = (
    value: Date | null | undefined,
    key: string,
    init: Intl.DateTimeFormatOptions,
  ) => {
    // An invalid Date formats as "Invalid Date" in the UI, which looks like a
    // broken page rather than missing data. Treat it as absent.
    if (!value || Number.isNaN(value.getTime())) return fallback;
    return formatterFor(key, init).format(value);
  };

  return {
    date: (value, style = "medium") => render(value, `d:${style}`, { dateStyle: style }),
    dateTime: (value, style = "short") =>
      render(value, `dt:${style}`, { dateStyle: style, timeStyle: "short" }),
    time: (value) => render(value, "t", { timeStyle: "short" }),
    timeZone,
  };
}

/**
 * Formatters for a viewer we know nothing about -- an unauthenticated page, a
 * background job writing a log line, a test. Uses the platform zone, which is
 * a stated fallback rather than a guess at the reader's own.
 */
export function platformDateFormatters(
  intlTag: string,
  options?: DateFormatterOptions,
): DateFormatters {
  return createDateFormatters({ intlTag, timeZone: PLATFORM_TIME_ZONE }, options);
}
