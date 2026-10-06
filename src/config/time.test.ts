import { describe, expect, it } from "vitest";

import { isTimeZone, PLATFORM_TIME_ZONE, resolveTimeZone } from "./time";

describe("isTimeZone", () => {
  it("accepts the zones the platform actually serves", () => {
    for (const zone of [
      "America/Toronto",
      "America/Vancouver",
      "Africa/Cairo",
      "Asia/Dubai",
      "Europe/London",
      "Europe/Paris",
      "UTC",
    ]) {
      expect(isTimeZone(zone), zone).toBe(true);
    }
  });

  it("rejects a bare language tag", () => {
    // The check is only worth anything if "en" cannot pass as a zone, since a
    // locale and a zone are easy to mix up at a call site.
    expect(isTimeZone("en")).toBe(false);
    expect(isTimeZone("en-CA")).toBe(false);
  });

  it("rejects nonsense and non-strings", () => {
    for (const value of ["", "Narnia/Nowhere", " ", null, undefined, 0, {}, []]) {
      expect(isTimeZone(value), String(value)).toBe(false);
    }
  });
});

describe("resolveTimeZone", () => {
  it("passes a real zone through", () => {
    expect(resolveTimeZone("Asia/Dubai")).toBe("Asia/Dubai");
  });

  it("falls back to the platform zone for anything it cannot use", () => {
    // Covers a signed-out viewer (undefined) and a stored value that has since
    // been removed from the zone database.
    expect(resolveTimeZone(undefined)).toBe(PLATFORM_TIME_ZONE);
    expect(resolveTimeZone("Narnia/Nowhere")).toBe(PLATFORM_TIME_ZONE);
  });
});
