import { TAX } from "@/config/commerce";
import { RATES_REVIEWED_ON } from "@/config/currency";
import type { ProductType } from "@/db/schema/enums";
import type { ScopeTierId } from "@/db/schema/enums";
import { localizePrice, type ConversionRecord } from "@/lib/pricing/localize";
import {
  BASE_CURRENCY,
  money,
  sumMoney,
  type Currency,
  type Money,
} from "@/lib/pricing/money";
import type { ScopeAssessment } from "@/lib/scope";

/**
 * Turning an assessment into a priced quote.
 *
 * This module is the **only** place a sellable total is computed, and it is
 * pure: no database, no session, no provider. Everything it needs arrives as
 * arguments, which is what lets the same arithmetic be unit-tested exhaustively
 * and then trusted by the order service.
 *
 * It is also the server's answer to price tampering. The client never submits
 * an amount; it submits a configuration. The server assesses that
 * configuration and derives the price here. A tampered payload can at most
 * describe a different project -- which gets priced correctly for what it
 * describes.
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
  assessorId: string;
  assessorVersion: string;
  tier: ScopeTierId;
  complexityPoints: number;
  tax: { enabled: boolean; rateBasisPoints: number; noteKey: string };
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

function zero(currency: Currency): Money {
  return money(0, currency);
}

/**
 * Tax per line.
 *
 * Returns zero while `TAX.enabled` is false. Written as a function rather than
 * inlined so switching it on is one place, and so the zero is visibly a policy
 * decision rather than a forgotten calculation.
 */
function taxFor(amount: Money): Money {
  if (!TAX.enabled) return zero(amount.currency);
  return money(
    Math.round((amount.minorUnits * TAX.rateBasisPoints) / 10_000),
    amount.currency,
  );
}

export interface BuildQuoteInput {
  assessment: ScopeAssessment;
  /** The currency to charge in. */
  currency: Currency;
  /** Capability keys the customer selected, for the order line. */
  selectedCapabilities: readonly string[];
  /** Fixed clock, so the snapshot is deterministic under test. */
  now?: Date;
}

/**
 * Builds the quote for a configured build.
 *
 * Produces one line for the build itself and, when "design it for me" was
 * chosen, a second for the design service. They are separate lines on purpose:
 * the invoice has to show what the design fee was, and bundling it would make
 * the build price look inconsistent between two customers who bought the same
 * build.
 */
export function buildQuote(input: BuildQuoteInput): QuoteResult {
  const { assessment, currency, selectedCapabilities, now = new Date() } = input;

  if (assessment.requiresCustomQuote) {
    return { ok: false, reason: "requires_custom_quote" };
  }
  if (!assessment.price) {
    return { ok: false, reason: "not_priceable" };
  }

  const lines: QuoteLine[] = [];

  const build = localizePrice(assessment.price, currency);
  const buildTax = taxFor(build.amount);
  lines.push({
    productKey: `build.${assessment.buildType}`,
    productType: "build",
    productName: `${assessment.buildType} build (${assessment.tier})`,
    translationKey: `build.${assessment.buildType}`,
    quantity: 1,
    unitAmount: build.amount,
    discount: zero(currency),
    tax: buildTax,
    total: money(build.amount.minorUnits + buildTax.minorUnits, currency),
    conversion: build.conversion,
    scopeTier: assessment.tier,
    guaranteedDays: assessment.guaranteedDays ?? undefined,
    selectedCapabilities,
  });

  if (assessment.designFee && assessment.designFee.minorUnits > 0) {
    const design = localizePrice(assessment.designFee, currency);
    const designTax = taxFor(design.amount);
    lines.push({
      productKey: "service.design",
      productType: "design_service",
      productName: "Design service",
      translationKey: "service.design",
      quantity: 1,
      unitAmount: design.amount,
      discount: zero(currency),
      tax: designTax,
      total: money(design.amount.minorUnits + designTax.minorUnits, currency),
      conversion: design.conversion,
    });
  }

  const subtotal = sumMoney(
    lines.map((line) => line.unitAmount),
    currency,
  );
  const discount = sumMoney(
    lines.map((line) => line.discount),
    currency,
  );
  const tax = sumMoney(
    lines.map((line) => line.tax),
    currency,
  );
  const total = money(
    subtotal.minorUnits - discount.minorUnits + tax.minorUnits,
    currency,
  );

  const pricingSnapshot: PricingSnapshot = {
    baseCurrency: BASE_CURRENCY,
    chargeCurrency: currency,
    ratesReviewedOn: RATES_REVIEWED_ON,
    assessorId: assessment.assessorId,
    assessorVersion: assessment.assessorVersion,
    tier: assessment.tier,
    complexityPoints: assessment.complexityPoints,
    tax: {
      enabled: TAX.enabled,
      rateBasisPoints: TAX.rateBasisPoints,
      noteKey: TAX.noteKey,
    },
    lines: lines.map((line) => ({
      productKey: line.productKey,
      baseMinorUnits: line.conversion.baseMinorUnits,
      rate: line.conversion.rate,
      roundToMinorUnits: line.conversion.roundToMinorUnits,
      chargedMinorUnits: line.unitAmount.minorUnits,
    })),
    quotedAt: now.toISOString(),
  };

  return {
    ok: true,
    quote: {
      currency,
      lines,
      subtotal,
      discount,
      tax,
      total,
      guaranteedDays: assessment.guaranteedDays,
      pricingSnapshot,
    },
  };
}
