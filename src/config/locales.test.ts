import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  getDirection,
  getLocaleDefinition,
  isLocale,
  LOCALE_DEFINITIONS,
  LOCALES,
  resolveLocale,
} from "./locales";

describe("resolveLocale", () => {
  it("passes a routing locale through", () => {
    for (const locale of LOCALES) {
      expect(resolveLocale(locale)).toBe(locale);
    }
  });

  /**
   * The bug this guards against: `orders.locale` and `invoices.locale` store
   * the full `intlTag`, so every French order resolved back to English and
   * would have rendered its invoice in the wrong language.
   */
  it("resolves a full BCP 47 tag to its language", () => {
    expect(resolveLocale("fr-CA")).toBe("fr");
    expect(resolveLocale("en-CA")).toBe("en");
    expect(resolveLocale("ar-EG")).toBe("ar");
    expect(resolveLocale("fr-FR")).toBe("fr");
  });

  it("ignores case, as BCP 47 does", () => {
    // An Accept-Language header may legitimately say this.
    expect(resolveLocale("FR-ca")).toBe("fr");
    expect(resolveLocale("AR")).toBe("ar");
  });

  it("falls back to the default for anything it cannot serve", () => {
    for (const value of ["de", "de-DE", "", "-", "zz", null, undefined, 7, {}]) {
      expect(resolveLocale(value), String(value)).toBe(DEFAULT_LOCALE);
    }
  });
});

describe("isLocale", () => {
  it("narrows only exact routing locales", () => {
    expect(isLocale("en")).toBe(true);
    // Not a routing locale: it is never a valid URL segment.
    expect(isLocale("en-CA")).toBe(false);
    expect(isLocale("de")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe("the locale registry", () => {
  it("defines every routing locale", () => {
    for (const locale of LOCALES) {
      const definition = getLocaleDefinition(locale);
      expect(definition.code).toBe(locale);
      expect(definition.nativeName.length).toBeGreaterThan(0);
      expect(definition.englishName.length).toBeGreaterThan(0);
    }
    expect(Object.keys(LOCALE_DEFINITIONS)).toHaveLength(LOCALES.length);
  });

  it("gives every intlTag to Intl without it throwing", () => {
    for (const locale of LOCALES) {
      const { intlTag } = getLocaleDefinition(locale);
      expect(() => new Intl.NumberFormat(intlTag).format(1)).not.toThrow();
      // A tag Intl silently falls back on would format in the wrong language.
      expect(new Intl.Locale(intlTag).language).toBe(locale);
    }
  });

  it("marks Arabic as the only right-to-left locale", () => {
    expect(getDirection("ar")).toBe("rtl");
    expect(getDirection("en")).toBe("ltr");
    expect(getDirection("fr")).toBe("ltr");
  });

  /**
   * `ar` rather than `ar-EG` is a deliberate choice, and a visible one: the
   * regional tag selects Arabic-Indic digits (٢٠٢٦) and in some runtimes a
   * non-Gregorian calendar. Prices, order references and delivery dates are
   * read back to us over the phone and typed into bank transfers, so the
   * platform shows Latin digits in Arabic. Changing this changes every number
   * on every Arabic page, so it is pinned by a test.
   */
  it("formats Arabic with Latin digits and the Gregorian calendar", () => {
    const { intlTag } = getLocaleDefinition("ar");
    expect(new Intl.NumberFormat(intlTag).format(2026)).toBe("2,026");
    expect(
      new Intl.DateTimeFormat(intlTag, {
        dateStyle: "short",
        timeZone: "UTC",
      }).format(new Date("2026-03-11T12:00:00Z")),
    ).toMatch(/2026/);
  });
});
