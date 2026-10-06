import { describe, expect, it } from "vitest";

import { PLATFORM_TIME_ZONE } from "@/config/time";
import { createDateFormatters, platformDateFormatters } from "./datetime";

describe("createDateFormatters", () => {
  /**
   * The reason this module exists. 23:30 UTC on 11 March is still 11 March in
   * Toronto but already 12 March in Dubai, and a deadline shown a day out is a
   * broken promise rather than a formatting nit.
   */
  it("renders the same instant as a different day in a different zone", () => {
    const instant = new Date("2026-03-11T23:30:00Z");

    const toronto = createDateFormatters({
      intlTag: "en-CA",
      timeZone: "America/Toronto",
    });
    const dubai = createDateFormatters({ intlTag: "en-CA", timeZone: "Asia/Dubai" });

    expect(toronto.date(instant, "short")).toContain("11");
    expect(dubai.date(instant, "short")).toContain("12");
    expect(toronto.date(instant)).not.toBe(dubai.date(instant));
  });

  it("does not fall back to the host zone", () => {
    // The bug being guarded against: an `Intl.DateTimeFormat` built without a
    // `timeZone` silently uses the process's, which is UTC in production.
    const instant = new Date("2026-03-11T23:30:00Z");
    const host = new Intl.DateTimeFormat("en-CA", { dateStyle: "short" }).format(instant);
    const cairo = createDateFormatters({
      intlTag: "en-CA",
      timeZone: "Africa/Cairo",
    }).date(instant, "short");

    expect(cairo).not.toBe(host);
  });

  it("formats a date, a date with a time and a time alone", () => {
    const instant = new Date("2026-03-11T15:00:00Z");
    const f = createDateFormatters({ intlTag: "en-CA", timeZone: "America/Toronto" });

    expect(f.date(instant)).toMatch(/2026/);
    expect(f.dateTime(instant)).toMatch(/11.*\d/s);
    // 15:00 UTC is 11:00 in Toronto on this date (EDT).
    expect(f.time(instant)).toMatch(/11/);
    expect(f.time(instant)).not.toMatch(/2026/);
  });

  it("reports the zone it rendered in, for disclosure in the UI", () => {
    const f = createDateFormatters({ intlTag: "fr-CA", timeZone: "Europe/London" });
    expect(f.timeZone).toBe("Europe/London");
  });

  describe("absent and broken values", () => {
    const f = createDateFormatters({ intlTag: "en-CA", timeZone: "America/Toronto" });

    it("renders the fallback rather than nothing", () => {
      expect(f.date(null)).toBe("—");
      expect(f.date(undefined)).toBe("—");
      expect(f.dateTime(null)).toBe("—");
      expect(f.time(null)).toBe("—");
    });

    it("treats an invalid Date as absent", () => {
      // Otherwise the page renders the literal string "Invalid Date", which
      // reads as a broken page rather than as missing data.
      expect(f.date(new Date("nonsense"))).toBe("—");
    });

    it("uses a caller's fallback, so a page can say its own thing", () => {
      const withNone = createDateFormatters(
        { intlTag: "en-CA", timeZone: "America/Toronto" },
        { fallback: "Not set" },
      );
      expect(withNone.date(null)).toBe("Not set");
    });
  });

  it("formats each locale in its own conventions", () => {
    const instant = new Date("2026-03-11T15:00:00Z");
    const zone = "America/Toronto";

    const en = createDateFormatters({ intlTag: "en-CA", timeZone: zone }).date(instant);
    const fr = createDateFormatters({ intlTag: "fr-CA", timeZone: zone }).date(instant);
    const ar = createDateFormatters({ intlTag: "ar", timeZone: zone }).date(instant);

    expect(en).not.toBe(fr);
    expect(fr).toMatch(/mars/);
    // `ar` rather than `ar-EG`: Latin digits, Gregorian calendar. See
    // LOCALE_DEFINITIONS for why.
    expect(ar).toMatch(/2026/);
  });

  it("reuses one Intl instance per style", () => {
    // Tables format one date per row per column; a fresh Intl.DateTimeFormat
    // per cell is measurable. Same style must hand back the same formatter.
    const f = createDateFormatters({ intlTag: "en-CA", timeZone: "America/Toronto" });
    const a = new Date("2026-03-11T15:00:00Z");
    const b = new Date("2026-07-02T15:00:00Z");
    expect(f.date(a)).not.toBe(f.date(b));
    expect(f.date(a, "short")).not.toBe(f.date(a, "long"));
  });
});

describe("platformDateFormatters", () => {
  it("falls back to the platform zone, not the host's", () => {
    expect(platformDateFormatters("en-CA").timeZone).toBe(PLATFORM_TIME_ZONE);
  });
});
