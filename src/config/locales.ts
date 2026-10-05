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

/** Coerces untrusted input to a supported locale, falling back to the default. */
export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
