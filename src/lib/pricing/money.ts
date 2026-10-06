/**
 * Money handling.
 *
 * Amounts are stored in minor units (cents) as integers. Prices must never be
 * floats: 0.1 + 0.2 is not 0.3 in binary floating point, and a platform that
 * issues invoices and partial refunds cannot afford rounding drift.
 */

/**
 * Currencies the platform can quote, charge and invoice in.
 *
 * Adding one changes the `currency` Postgres enum, so it is a migration and a
 * deliberate act -- which is the point. Every entry needs a minor-unit factor
 * below and a presentation rule in `@/config/currency`.
 */
export const SUPPORTED_CURRENCIES = [
  "CAD",
  "USD",
  "EUR",
  "GBP",
  "AED",
  "SAR",
  "EGP",
] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

/** The currency all internal pricing is defined in. */
export const BASE_CURRENCY: Currency = "CAD";

export interface Money {
  /** Integer amount in minor units (cents). */
  readonly minorUnits: number;
  readonly currency: Currency;
}

/** Number of minor units in one major unit, per currency. */
const MINOR_UNIT_FACTOR: Record<Currency, number> = {
  CAD: 100,
  USD: 100,
  EUR: 100,
  GBP: 100,
  AED: 100,
  SAR: 100,
  EGP: 100,
};

export function money(minorUnits: number, currency: Currency = BASE_CURRENCY): Money {
  if (!Number.isInteger(minorUnits)) {
    throw new TypeError(
      `Money requires integer minor units, received ${minorUnits}. ` +
        "Convert major units with `fromMajorUnits` instead of multiplying inline.",
    );
  }
  return { minorUnits, currency };
}

export function fromMajorUnits(
  amount: number,
  currency: Currency = BASE_CURRENCY,
): Money {
  return money(Math.round(amount * MINOR_UNIT_FACTOR[currency]), currency);
}

export function toMajorUnits(value: Money): number {
  return value.minorUnits / MINOR_UNIT_FACTOR[value.currency];
}

/** True when the amount has no fractional part in its major unit. */
export function isWholeAmount(value: Money): boolean {
  return value.minorUnits % MINOR_UNIT_FACTOR[value.currency] === 0;
}

export interface FormatMoneyOptions {
  /**
   * Hide the `.00` on whole amounts. A headline price reads as "$400", not
   * "$400.00"; an invoice line keeps its decimals.
   */
  trimWholeDecimals?: boolean;
  /** Narrow symbol ("$400") versus the code ("CAD 400"). */
  display?: "symbol" | "narrowSymbol" | "code";
}

/**
 * Formats money for display.
 *
 * `intlTag` is the full BCP 47 tag from the locale registry ("en-CA", "fr-CA"),
 * not the bare language code -- that is what gets the separators, symbol
 * placement and digit shaping right for the region.
 */
export function formatMoney(
  value: Money,
  intlTag: string,
  options: FormatMoneyOptions = {},
): string {
  const { trimWholeDecimals = false, display = "narrowSymbol" } = options;
  const trim = trimWholeDecimals && isWholeAmount(value);

  return new Intl.NumberFormat(intlTag, {
    style: "currency",
    currency: value.currency,
    currencyDisplay: display,
    minimumFractionDigits: trim ? 0 : undefined,
    maximumFractionDigits: trim ? 0 : undefined,
  }).format(toMajorUnits(value));
}

/** Subtracts b from a. Mixing currencies is a programming error, not a conversion. */
export function subtractMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new TypeError(
      `Cannot subtract ${b.currency} from ${a.currency}. Convert to a common currency first.`,
    );
  }
  return money(a.minorUnits - b.minorUnits, a.currency);
}

/** Sums a list. An empty list is zero in the given currency, not an error. */
export function sumMoney(values: readonly Money[], currency: Currency): Money {
  return values.reduce((total, value) => addMoney(total, value), money(0, currency));
}

/** Adds two amounts. Mixing currencies is a programming error, not a conversion. */
export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new TypeError(
      `Cannot add ${a.currency} to ${b.currency}. Convert to a common currency first.`,
    );
  }
  return money(a.minorUnits + b.minorUnits, a.currency);
}

/**
 * Takes a percentage of an amount, rounding to the nearest minor unit.
 *
 * Used for the missed-deadline refunds (100% and 30%), so it has to land on an
 * exact integer number of cents.
 */
export function percentOf(value: Money, percent: number): Money {
  return money(Math.round((value.minorUnits * percent) / 100), value.currency);
}
