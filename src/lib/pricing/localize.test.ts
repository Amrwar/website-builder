import { describe, expect, it } from "vitest";

import { CURRENCY_PRESENTATION } from "@/config/currency";
import { localizePrice, quoteCurrencyFor, roundUpTo } from "./localize";
import {
  BASE_CURRENCY,
  SUPPORTED_CURRENCIES,
  fromMajorUnits,
  money,
  type Currency,
} from "./money";

describe("the currency list", () => {
  it("covers every currency the brief names", () => {
    for (const currency of ["CAD", "USD", "EGP", "AED", "EUR", "GBP"] as const) {
      expect(SUPPORTED_CURRENCIES, currency).toContain(currency);
    }
  });

  it("has a presentation rule for every supported currency", () => {
    // A currency with no rule would convert at `undefined` and produce NaN.
    for (const currency of SUPPORTED_CURRENCIES) {
      expect(CURRENCY_PRESENTATION[currency], currency).toBeDefined();
      expect(CURRENCY_PRESENTATION[currency].rate, currency).toBeGreaterThan(0);
    }
  });
});

describe("the base currency is never converted", () => {
  it("returns the exact amount it was given", () => {
    const price = fromMajorUnits(400);
    const { amount } = localizePrice(price, BASE_CURRENCY);

    // 400 CAD must print as 400 CAD, not as a rounded approximation of itself.
    expect(amount.minorUnits).toBe(40_000);
    expect(amount.currency).toBe("CAD");
  });

  it("records a rate of exactly 1", () => {
    const { conversion } = localizePrice(fromMajorUnits(400), BASE_CURRENCY);
    expect(conversion.rate).toBe(1);
    expect(conversion.roundToMinorUnits).toBe(1);
  });
});

describe("conversion", () => {
  it("refuses an amount that is not in the base currency", () => {
    // Converting an already-converted figure would compound two roundings.
    expect(() => localizePrice(money(1000, "USD"), "EUR")).toThrow(TypeError);
  });

  it("rounds up to the configured step, never down", () => {
    for (const currency of SUPPORTED_CURRENCIES) {
      const { amount, conversion } = localizePrice(fromMajorUnits(400), currency);
      const raw = 40_000 * conversion.rate;

      expect(
        amount.minorUnits,
        `${currency} rounded below the real figure`,
      ).toBeGreaterThanOrEqual(Math.floor(raw));
      expect(
        amount.minorUnits % conversion.roundToMinorUnits,
        `${currency} did not land on a whole step`,
      ).toBe(0);
    }
  });

  it("never rounds a price down, which would quietly cost margin", () => {
    // Rate drift between manual reviews must not land on the wrong side.
    for (const currency of SUPPORTED_CURRENCIES) {
      if (currency === BASE_CURRENCY) continue;
      const { amount, conversion } = localizePrice(fromMajorUnits(437), currency);
      expect(amount.minorUnits, currency).toBeGreaterThanOrEqual(
        43_700 * conversion.rate,
      );
    }
  });

  it("produces a figure in the target currency", () => {
    const { amount } = localizePrice(fromMajorUnits(400), "EGP");
    expect(amount.currency).toBe("EGP");
  });

  it("carries the full derivation in the conversion record", () => {
    const { conversion } = localizePrice(fromMajorUnits(600), "USD");

    // This record is what makes a charged figure explainable years later.
    expect(conversion.baseCurrency).toBe("CAD");
    expect(conversion.baseMinorUnits).toBe(60_000);
    expect(conversion.targetCurrency).toBe("USD");
    expect(conversion.rate).toBe(CURRENCY_PRESENTATION.USD.rate);
    expect(conversion.ratesReviewedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("is deterministic: the same input converts identically every time", () => {
    // No live rate lookup; the same visitor sees the same price tomorrow.
    const first = localizePrice(fromMajorUnits(400), "EUR").amount.minorUnits;
    const second = localizePrice(fromMajorUnits(400), "EUR").amount.minorUnits;
    expect(first).toBe(second);
  });
});

describe("roundUpTo", () => {
  it("leaves a value already on a step alone", () => {
    expect(roundUpTo(5000, 500)).toBe(5000);
  });

  it("rounds a value just above a step up to the next one", () => {
    expect(roundUpTo(5001, 500)).toBe(5500);
  });

  it("treats a step of 1 as no rounding", () => {
    expect(roundUpTo(40_000, 1)).toBe(40_000);
  });
});

describe("choosing the quote currency", () => {
  it("honours a supported preference", () => {
    expect(quoteCurrencyFor("EGP")).toBe("EGP");
  });

  it("falls back to the base currency for anything else", () => {
    for (const value of [null, undefined, "", "XYZ", "btc"]) {
      expect(quoteCurrencyFor(value as string | null | undefined)).toBe(BASE_CURRENCY);
    }
  });

  it("never returns a currency with no presentation rule", () => {
    const resolved: Currency = quoteCurrencyFor("JPY");
    expect(CURRENCY_PRESENTATION[resolved]).toBeDefined();
  });
});
