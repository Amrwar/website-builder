import { describe, expect, it } from "vitest";

import {
  addMoney,
  formatMoney,
  fromMajorUnits,
  isWholeAmount,
  money,
  percentOf,
  toMajorUnits,
} from "./money";

describe("money", () => {
  it("rejects non-integer minor units", () => {
    expect(() => money(400.5)).toThrow(/integer minor units/);
  });

  it("converts major units without floating-point drift", () => {
    expect(fromMajorUnits(400).minorUnits).toBe(40_000);
    // 19.99 * 100 is 1998.9999999999998 in binary floating point.
    expect(fromMajorUnits(19.99).minorUnits).toBe(1999);
  });

  it("round-trips major units", () => {
    expect(toMajorUnits(fromMajorUnits(600))).toBe(600);
  });

  it("identifies whole amounts", () => {
    expect(isWholeAmount(fromMajorUnits(400))).toBe(true);
    expect(isWholeAmount(fromMajorUnits(400.5))).toBe(false);
  });
});

describe("addMoney", () => {
  it("adds matching currencies", () => {
    expect(addMoney(fromMajorUnits(400), fromMajorUnits(200)).minorUnits).toBe(60_000);
  });

  it("refuses to add mismatched currencies", () => {
    expect(() => addMoney(fromMajorUnits(400, "CAD"), fromMajorUnits(400, "USD"))).toThrow(
      /Cannot add/,
    );
  });
});

describe("percentOf", () => {
  it("computes the full refund", () => {
    expect(percentOf(fromMajorUnits(400), 100).minorUnits).toBe(40_000);
  });

  it("computes the partial refund on the published prices", () => {
    // The 30% continue-and-refund term from the deadline guarantee.
    expect(percentOf(fromMajorUnits(400), 30).minorUnits).toBe(12_000);
    expect(percentOf(fromMajorUnits(600), 30).minorUnits).toBe(18_000);
  });

  it("rounds to a whole minor unit rather than leaving fractional cents", () => {
    // 30% of $4.33 is 129.9 cents.
    const result = percentOf(fromMajorUnits(4.33), 30);
    expect(Number.isInteger(result.minorUnits)).toBe(true);
    expect(result.minorUnits).toBe(130);
  });
});

describe("formatMoney", () => {
  it("trims decimals on whole headline prices", () => {
    expect(formatMoney(fromMajorUnits(400), "en-CA", { trimWholeDecimals: true })).toBe(
      "$400",
    );
  });

  it("keeps decimals when the amount is not whole", () => {
    const result = formatMoney(fromMajorUnits(400.5), "en-CA", {
      trimWholeDecimals: true,
    });
    expect(result).toContain("400.50");
  });

  it("keeps decimals for invoice-style output", () => {
    expect(formatMoney(fromMajorUnits(400), "en-CA")).toBe("$400.00");
  });

  it("formats per region rather than per language", () => {
    const fr = formatMoney(fromMajorUnits(400), "fr-CA", { trimWholeDecimals: true });
    // French Canadian puts the symbol after the amount; the separator is a
    // non-breaking space, so assert on the parts rather than an exact string.
    expect(fr).toMatch(/400/);
    expect(fr).toMatch(/\$/);
    expect(fr.indexOf("$")).toBeGreaterThan(fr.indexOf("400"));
  });

  it("can render the currency code for ambiguous symbols", () => {
    const result = formatMoney(fromMajorUnits(400), "en-CA", {
      display: "code",
      trimWholeDecimals: true,
    });
    expect(result).toContain("CAD");
  });
});
