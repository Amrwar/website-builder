/**
 * Locale registry -- the single source of truth for which languages the
 * platform serves and how each one must be presented.
 *
 * Language and pricing currency are deliberately kept orthogonal: a French
 * speaker in Montreal is served `fr` but still pays in CAD, and an English
 * speaker in Dubai is served `en` but sees AED. Currency resolution lives in
 * the pricing module and keys off region, never off language.
 */

export const LOCALES = ["en", "fr", "ar"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export type TextDirection = "ltr" | "rtl";

export interface LocaleDefinition {
  /** BCP 47 code, also the URL segment. */
  code: Locale;
  /** Name in the language itself, for the locale switcher. */
  nativeName: string;
  /** Name in English, for admin surfaces and logs. */
  englishName: string;
  direction: TextDirection;
  /**
   * Full BCP 47 tag handed to `Intl` formatters. Distinct from `code` so that
   * date and number formatting is regionally correct rather than merely
   * language-correct.
   */
  intlTag: string;
}

export const LOCALE_DEFINITIONS: Record<Locale, LocaleDefinition> = {
  en: {
    code: "en",
    nativeName: "English",
    englishName: "English",
    direction: "ltr",
    intlTag: "en-CA",
  },
  fr: {
    code: "fr",
    nativeName: "Français",
    englishName: "French",
    direction: "ltr",
    intlTag: "fr-CA",
  },
  ar: {
    code: "ar",
    nativeName: "العربية",
    englishName: "Arabic",
    direction: "rtl",
    intlTag: "ar",
  },
};

/** Narrowing type guard for untrusted input (URL segments, cookies, headers). */
export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function getLocaleDefinition(locale: Locale): LocaleDefinition {
  return LOCALE_DEFINITIONS[locale];
}

export function getDirection(locale: Locale): TextDirection {
  return LOCALE_DEFINITIONS[locale].direction;
}

/**
 * Coerces untrusted input to a supported locale, falling back to the default.
 *
 * Accepts a full BCP 47 tag as well as a bare code, because the same value
 * arrives in both shapes: a URL segment is "fr", but `orders.locale` and
 * `invoices.locale` store the full `intlTag` ("fr-CA") so the pricing snapshot
 * records the exact tag the document was priced and rendered in. Matching only
 * the bare code meant every French order resolved back to English.
 *
 * Case-insensitive: language subtags are case-insensitive in BCP 47, and an
 * `Accept-Language` header can legitimately say "FR-ca".
 */
export function resolveLocale(value: unknown): Locale {
  if (typeof value !== "string") return DEFAULT_LOCALE;
  const language = value.split("-")[0]?.toLowerCase();
  return isLocale(language) ? language : DEFAULT_LOCALE;
}
