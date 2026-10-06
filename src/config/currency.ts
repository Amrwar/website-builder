import { BASE_CURRENCY, type Currency } from "@/lib/pricing/money";

/**
 * Local pricing presentation.
 *
 * Prices are defined once in CAD and *published* in each supported currency
 * through this table. This is a configured price list, not a currency
 * converter: no live exchange-rate call happens on any page render, and the
 * same visitor sees the same figure tomorrow as today.
 *
 * That is deliberate. A fixed-price product whose headline number moves with
 * the spot rate is not a fixed price, and a quote that changes between the
 * pricing page and the checkout destroys the one thing this product sells.
 *
 * ────────────────────────────────────────────────────────────────────────
 * COMMERCIAL NOTE: the rates below are provisional placeholders, chosen to
 * be plausible and internally consistent as of `RATES_REVIEWED_ON`. They need
 * commercial sign-off, and thereafter a deliberate human review on a schedule
 * -- not an automated feed. Updating them changes published prices for new
 * quotes only; orders already placed carry their own snapshot and are
 * unaffected.
 * ────────────────────────────────────────────────────────────────────────
 */

/** The date the rate table was last reviewed by a human. */
export const RATES_REVIEWED_ON = "2026-10-05";

export interface CurrencyPresentation {
  /**
   * Multiplier from the base currency. `BASE_CURRENCY` is always exactly 1.
   */
  rate: number;
  /**
   * Published prices are rounded up to a whole multiple of this many minor
   * units, so a converted figure lands on a number a human would write on a
   * price list rather than on 541.37.
   */
  roundToMinorUnits: number;
}

export const CURRENCY_PRESENTATION: Record<Currency, CurrencyPresentation> = {
  // The base. Never converted, never rounded away from its defined value.
  CAD: { rate: 1, roundToMinorUnits: 1 },

  USD: { rate: 0.73, roundToMinorUnits: 500 },
  EUR: { rate: 0.68, roundToMinorUnits: 500 },
  GBP: { rate: 0.57, roundToMinorUnits: 500 },

  // Gulf currencies are pegged to USD, so these move only when the peg does.
  AED: { rate: 2.68, roundToMinorUnits: 2500 },
  SAR: { rate: 2.74, roundToMinorUnits: 2500 },

  // Egypt: a much larger nominal figure, so it rounds to a coarser step. A
  // price ending in 37 piastres reads as a conversion artefact, which is
  // exactly the impression a published price list must not give.
  EGP: { rate: 36, roundToMinorUnits: 50_000 },
};

/**
 * Rounding up rather than to nearest is a margin decision, not an aesthetic
 * one: between two human reviews of the table the real rate can drift, and the
 * drift should never land on the wrong side of the published price.
 */
export const ROUNDING_DIRECTION = "up" as const;

export function presentationFor(currency: Currency): CurrencyPresentation {
  return CURRENCY_PRESENTATION[currency];
}

/** True when the currency is quoted directly rather than converted. */
export function isBaseCurrency(currency: Currency): boolean {
  return currency === BASE_CURRENCY;
}
