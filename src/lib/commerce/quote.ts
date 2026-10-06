import { TAX } from "@/config/commerce";
import type { ProductType, ScopeTierId } from "@/db/schema/enums";
import type { PriceLine, ProjectAssessment } from "@/lib/engine";
import type { ConversionRecord } from "@/lib/pricing/localize";
import { BASE_CURRENCY, money, type Currency, type Money } from "@/lib/pricing/money";

/**
 * Turning an assessment into orderable lines.
 *
 * This module no longer prices anything. Until Phase 10 it computed a total
 * from a `ScopeAssessment` while the engine computed one from the catalogue,
 * which is two implementations of the same number -- and two places for it to
 * drift. The arithmetic now lives in `lib/engine` alone, and this file's only
 * job is to shape that one answer into the rows an order, an invoice and a
 * payment need.
 *
 * What it still owns is the commercial presentation of a price: which product
 * key each amount is sold under, and how a single order-level discount and tax
 * figure are attributed to individual lines so an invoice adds up.
 *
 * The server still decides the price, and it is still impossible to propose
 * one: there is no amount in any input here either.
 */

export interface QuoteLine {
  productKey: string;
  productType: ProductType;
  /** Internal name; customer-facing copy comes from `translationKey`. */
  productName: string;
  translationKey: string;
  quantity: number;
  unitAmount: Money;
  discount: Money;
  tax: Money;
  total: Money;
  /** How the charged figure was derived from the base-currency price. */
  conversion: ConversionRecord;
  scopeTier?: ScopeTierId;
  guaranteedDays?: number;
  selectedCapabilities?: readonly string[];
}

/** Everything needed to explain a total years later. */
export interface PricingSnapshot {
  baseCurrency: Currency;
  chargeCurrency: Currency;
  ratesReviewedOn: string;
  /** The engine and ruleset that produced the figure. */
  engineId: string;
  engineVersion: string;
  assessorId: string;
  assessorVersion: string;
  tier: ScopeTierId;
  complexityPoints: number;
  tax: { enabled: boolean; rateBasisPoints: number; noteKey: string };
  /** The coupon applied, if any, recorded so a lower total is explainable. */
  discount: { code: string; kind: string; minorUnits: number } | null;
  lines: {
    productKey: string;
    baseMinorUnits: number;
    rate: number;
    roundToMinorUnits: number;
    chargedMinorUnits: number;
  }[];
  quotedAt: string;
}

export interface Quote {
  currency: Currency;
  lines: readonly QuoteLine[];
  subtotal: Money;
  discount: Money;
  tax: Money;
  total: Money;
  guaranteedDays: number | null;
  pricingSnapshot: PricingSnapshot;
}

/** A brief that cannot be sold at a published price yields no quote. */
export type QuoteResult =
  | { ok: true; quote: Quote }
  | { ok: false; reason: "requires_custom_quote" | "not_priceable" };

const PRODUCT_TYPE_BY_KIND: Record<PriceLine["kind"], ProductType> = {
  build: "build",
  design_service: "design_service",
  feature: "business_product",
  integration: "business_product",
  time: "business_product",
};

/**
 * Splits an order-level amount across lines in proportion to their value.
 *
 * Uses largest-remainder: every line gets the floor of its share, and the
 * minor units lost to flooring go to the lines with the biggest remainders.
 * The result is that the line amounts sum to *exactly* the order amount --
 * which matters because an invoice whose lines are a cent off its total is an
 * invoice a customer will query and an accountant will reject.
 */
function allocate(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((carry, weight) => carry + weight, 0);
  if (total === 0 || sum === 0) return weights.map(() => 0);

  const exact = weights.map((weight) => (total * weight) / sum);
  const floored = exact.map((value) => Math.floor(value));
  let remaining = total - floored.reduce((carry, value) => carry + value, 0);

  const order = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);

  for (const entry of order) {
    if (remaining <= 0) break;
    floored[entry.index] = (floored[entry.index] ?? 0) + 1;
    remaining -= 1;
  }

  return floored;
}

function nameFor(line: PriceLine, assessment: ProjectAssessment): string {
  switch (line.kind) {
    case "build":
      return `${assessment.buildType} build (${assessment.tier})`;
    case "design_service":
      return "Design service";
    default:
      return line.key;
  }
}

export interface BuildQuoteInput {
  /** The one authoritative assessment, from `lib/engine`. */
  assessment: ProjectAssessment;
  /** Capability keys the customer selected, for the order line. */
  selectedCapabilities: readonly string[];
  /** Fixed clock, so the snapshot is deterministic under test. */
  now?: Date;
}

/**
 * Builds the quote for an assessed project.
 *
 * Produces one line per priced component -- the build itself, the design
 * service when "design it for me" was chosen, and any feature carrying a
 * surcharge. They are separate lines on purpose: the invoice has to show what
 * each part cost, and bundling them would make the build price look
 * inconsistent between two customers who bought the same build.
 */
export function buildQuote(input: BuildQuoteInput): QuoteResult {
  const { assessment, selectedCapabilities, now = new Date() } = input;

  if (assessment.requiresCustomQuote) {
    return { ok: false, reason: "requires_custom_quote" };
  }
  if (!assessment.price || assessment.price.lines.length === 0) {
    return { ok: false, reason: "not_priceable" };
  }

  const price = assessment.price;
  const currency = price.currency;
  const weights = price.lines.map((line) => line.amount.minorUnits);

  // Both the discount and the tax are decided once, at order level, by the
  // engine. Attributing them per line here keeps the invoice readable without
  // ever recomputing either figure.
  const discounts = allocate(price.discount.minorUnits, weights);
  const taxes = allocate(price.tax.minorUnits, weights);

  const lines: QuoteLine[] = price.lines.map((line, index) => {
    const discount = discounts[index] ?? 0;
    const tax = taxes[index] ?? 0;
    const isBuild = line.kind === "build";

    return {
      productKey: line.key,
      productType: PRODUCT_TYPE_BY_KIND[line.kind],
      productName: nameFor(line, assessment),
      translationKey: line.key,
      quantity: line.quantity,
      unitAmount: line.amount,
      discount: money(discount, currency),
      tax: money(tax, currency),
      total: money(line.amount.minorUnits - discount + tax, currency),
      conversion: line.conversion,
      ...(isBuild
        ? {
            scopeTier: assessment.tier,
            guaranteedDays: assessment.delivery.guaranteedDays ?? undefined,
            selectedCapabilities,
          }
        : {}),
    };
  });

  const pricingSnapshot: PricingSnapshot = {
    baseCurrency: BASE_CURRENCY,
    chargeCurrency: currency,
    // Taken from the conversion the engine actually used, so the snapshot
    // records the rate that produced this total rather than today's.
    ratesReviewedOn: price.lines[0]?.conversion.ratesReviewedOn ?? "",
    engineId: assessment.engineId,
    engineVersion: assessment.engineVersion,
    assessorId: assessment.assessorId,
    assessorVersion: assessment.assessorVersion,
    tier: assessment.tier,
    complexityPoints: assessment.complexityPoints,
    tax: {
      enabled: TAX.enabled,
      rateBasisPoints: TAX.rateBasisPoints,
      noteKey: TAX.noteKey,
    },
    discount: price.appliedDiscount
      ? {
          code: price.appliedDiscount.code,
          kind: price.appliedDiscount.kind,
          minorUnits: price.appliedDiscount.amount.minorUnits,
        }
      : null,
    lines: price.lines.map((line) => ({
      productKey: line.key,
      baseMinorUnits: line.conversion.baseMinorUnits,
      rate: line.conversion.rate,
      roundToMinorUnits: line.conversion.roundToMinorUnits,
      chargedMinorUnits: line.amount.minorUnits,
    })),
    quotedAt: now.toISOString(),
  };

  return {
    ok: true,
    quote: {
      currency,
      lines,
      subtotal: price.subtotal,
      discount: price.discount,
      tax: price.tax,
      total: price.total,
      guaranteedDays: assessment.delivery.guaranteedDays,
      pricingSnapshot,
    },
  };
}
