import {
  CURRENCY_PRESENTATION,
  RATES_REVIEWED_ON,
  presentationFor,
} from "@/config/currency";
import { BASE_CURRENCY, money, type Currency, type Money } from "./money";

/**
 * Converting a base-currency price into a published local price.
 *
 * Two rules hold everywhere this is used:
 *
 *  1. The base currency is never converted. `localizePrice(x, "CAD")` returns
 *     `x` untouched, not `x * 1` rounded to a step, so the published CAD price
 *     is exactly the number in the product configuration.
 *  2. Conversion is from a configured table, never a live feed, and the result
 *     is rounded **up** to a whole step. See `@/config/currency`.
 *
 * Every conversion can produce a `ConversionRecord`, which is what gets frozen
 * into an order so the arithmetic behind a charged figure stays auditable long
 * after the table has moved on.
 */

export interface ConversionRecord {
  baseCurrency: Currency;
  /** The amount before conversion, in base-currency minor units. */
  baseMinorUnits: number;
  targetCurrency: Currency;
  /** The multiplier applied. 1 when no conversion took place. */
  rate: number;
  /** The rounding step applied, in target minor units. */
  roundToMinorUnits: number;
  /** When the rate table was last reviewed by a human. */
  ratesReviewedOn: string;
}

export interface LocalizedPrice {
  amount: Money;
  conversion: ConversionRecord;
}

/** Rounds up to a whole multiple of `step`. A step of 1 is a no-op. */
export function roundUpTo(minorUnits: number, step: number): number {
  if (step <= 1) return Math.ceil(minorUnits);
  return Math.ceil(minorUnits / step) * step;
}

/**
 * Converts a base-currency amount into a published price in `target`.
 *
 * Throws when given an amount that is not in the base currency: a price list
 * is defined in one currency, and silently converting from an already-converted
 * figure would compound two roundings.
 */
/**
 * A rate and rounding step from the editable catalogue, overriding the shipped
 * defaults. Passed rather than looked up, so this module stays pure and the
 * engine's arithmetic is reproducible from its arguments alone.
 */
export interface CurrencyOverride {
  rate: number;
  roundToMinorUnits: number;
  reviewedOn: string;
}

export function localizePrice(
  base: Money,
  target: Currency,
  override?: CurrencyOverride,
): LocalizedPrice {
  if (base.currency !== BASE_CURRENCY) {
    throw new TypeError(
      `localizePrice expects a ${BASE_CURRENCY} amount, received ${base.currency}. ` +
        "Published prices are defined in the base currency and converted once.",
    );
  }

  const shipped = presentationFor(target);
  const rate = override?.rate ?? shipped.rate;
  const roundToMinorUnits = override?.roundToMinorUnits ?? shipped.roundToMinorUnits;

  const conversion: ConversionRecord = {
    baseCurrency: base.currency,
    baseMinorUnits: base.minorUnits,
    targetCurrency: target,
    rate: target === BASE_CURRENCY ? 1 : rate,
    roundToMinorUnits: target === BASE_CURRENCY ? 1 : roundToMinorUnits,
    ratesReviewedOn: override?.reviewedOn ?? RATES_REVIEWED_ON,
  };

  // The base currency passes through untouched: its number is the price, not
  // an approximation of one.
  if (target === BASE_CURRENCY) {
    return { amount: base, conversion };
  }

  const converted = roundUpTo(base.minorUnits * rate, roundToMinorUnits);
  return { amount: money(converted, target), conversion };
}

/**
 * The currency to quote a customer in.
 *
 * Their saved preference wins; otherwise the base currency. Deliberately not
 * inferred from IP or `Accept-Language` -- guessing someone's currency and
 * being wrong at a checkout is worse than showing the one they chose.
 */
export function quoteCurrencyFor(preferred: string | null | undefined): Currency {
  if (preferred && preferred in CURRENCY_PRESENTATION) {
    return preferred as Currency;
  }
  return BASE_CURRENCY;
}
