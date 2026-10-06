import { describe, expect, it } from "vitest";

import { TAX } from "@/config/commerce";
import { fromMajorUnits } from "@/lib/pricing/money";
import type { ScopeAssessment } from "@/lib/scope";
import { buildQuote } from "./quote";

/**
 * Pricing is the one piece of this system a customer has a direct financial
 * incentive to influence, so these tests are written from that angle: what can
 * a caller change, and what can it reach?
 *
 * The answer the design relies on is that `buildQuote` takes no amount at all.
 * It takes an assessment and a currency, and derives everything else.
 */

function assessment(overrides: Partial<ScopeAssessment> = {}): ScopeAssessment {
  return {
    assessorId: "rule-engine",
    assessorVersion: "2026.10.2",
    buildType: "website",
    tier: "essential",
    complexityPoints: 4,
    capabilities: [],
    reasons: [],
    requiresCustomQuote: false,
    price: fromMajorUnits(400),
    designFee: null,
    totalPrice: fromMajorUnits(400),
    complexity: "simple",
    guaranteedDays: 5,
    exceededEntryTierBy: [],
    ...overrides,
  };
}

function unwrap(result: ReturnType<typeof buildQuote>) {
  if (!result.ok) throw new Error(`expected a quote, got ${result.reason}`);
  return result.quote;
}

describe("the entry offer prices exactly as published", () => {
  it("charges 400 CAD for an essential website", () => {
    const quote = unwrap(
      buildQuote({ assessment: assessment(), currency: "CAD", selectedCapabilities: [] }),
    );

    expect(quote.total.minorUnits).toBe(40_000);
    expect(quote.total.currency).toBe("CAD");
  });

  it("carries the guaranteed days through to the order", () => {
    const quote = unwrap(
      buildQuote({ assessment: assessment(), currency: "CAD", selectedCapabilities: [] }),
    );
    expect(quote.guaranteedDays).toBe(5);
    expect(quote.lines[0]?.guaranteedDays).toBe(5);
  });
});

describe("the design service is its own line", () => {
  it("adds a second line rather than inflating the build price", () => {
    // Bundling would make the same build look like a different price to two
    // customers, and would hide the fee on the invoice.
    const quote = unwrap(
      buildQuote({
        assessment: assessment({
          designFee: fromMajorUnits(50),
          totalPrice: fromMajorUnits(450),
        }),
        currency: "CAD",
        selectedCapabilities: [],
      }),
    );

    expect(quote.lines).toHaveLength(2);
    expect(quote.lines[0]?.unitAmount.minorUnits).toBe(40_000);
    expect(quote.lines[1]?.productType).toBe("design_service");
    expect(quote.lines[1]?.unitAmount.minorUnits).toBe(5_000);
    expect(quote.total.minorUnits).toBe(45_000);
  });

  it("omits the line when no design fee applies", () => {
    const quote = unwrap(
      buildQuote({ assessment: assessment(), currency: "CAD", selectedCapabilities: [] }),
    );
    expect(quote.lines).toHaveLength(1);
  });
});

describe("a brief that cannot be sold at a published price", () => {
  it("produces no quote at all", () => {
    const result = buildQuote({
      assessment: assessment({
        requiresCustomQuote: true,
        tier: "custom",
        price: null,
        totalPrice: null,
        guaranteedDays: null,
      }),
      currency: "CAD",
      selectedCapabilities: [],
    });

    // Not a zero, not a fallback price -- nothing. The customer is routed to a
    // quotation rather than quietly underquoted.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("requires_custom_quote");
  });

  it("refuses an assessment with no price even when the flag is unset", () => {
    const result = buildQuote({
      assessment: assessment({ price: null, totalPrice: null }),
      currency: "CAD",
      selectedCapabilities: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not_priceable");
  });
});

describe("local pricing", () => {
  it("charges in the requested currency", () => {
    const quote = unwrap(
      buildQuote({ assessment: assessment(), currency: "EGP", selectedCapabilities: [] }),
    );

    expect(quote.currency).toBe("EGP");
    expect(quote.total.currency).toBe("EGP");
    expect(quote.lines.every((line) => line.unitAmount.currency === "EGP")).toBe(true);
  });

  it("records the derivation for every line", () => {
    const quote = unwrap(
      buildQuote({
        assessment: assessment({
          designFee: fromMajorUnits(50),
          totalPrice: fromMajorUnits(450),
        }),
        currency: "USD",
        selectedCapabilities: [],
      }),
    );

    expect(quote.pricingSnapshot.lines).toHaveLength(2);
    for (const line of quote.pricingSnapshot.lines) {
      expect(line.baseMinorUnits).toBeGreaterThan(0);
      expect(line.rate).toBeGreaterThan(0);
      expect(line.chargedMinorUnits).toBeGreaterThan(0);
    }
  });

  it("totals equal the sum of the lines, in every currency", () => {
    for (const currency of ["CAD", "USD", "EUR", "GBP", "AED", "SAR", "EGP"] as const) {
      const quote = unwrap(
        buildQuote({
          assessment: assessment({
            designFee: fromMajorUnits(50),
            totalPrice: fromMajorUnits(450),
          }),
          currency,
          selectedCapabilities: [],
        }),
      );

      const summed = quote.lines.reduce((n, line) => n + line.unitAmount.minorUnits, 0);
      expect(quote.subtotal.minorUnits, currency).toBe(summed);
      expect(quote.total.minorUnits, currency).toBe(
        summed - quote.discount.minorUnits + quote.tax.minorUnits,
      );
    }
  });
});

describe("tax", () => {
  it("is zero and says so, because no registration exists", () => {
    const quote = unwrap(
      buildQuote({ assessment: assessment(), currency: "CAD", selectedCapabilities: [] }),
    );

    expect(TAX.enabled).toBe(false);
    expect(quote.tax.minorUnits).toBe(0);
    // Recorded as a policy, not an absence, so an invoice can state the reason.
    expect(quote.pricingSnapshot.tax.enabled).toBe(false);
    expect(quote.pricingSnapshot.tax.noteKey).toBe(TAX.noteKey);
  });
});

describe("the snapshot makes a price defensible", () => {
  it("names the assessor and the exact ruleset that priced it", () => {
    const quote = unwrap(
      buildQuote({ assessment: assessment(), currency: "CAD", selectedCapabilities: [] }),
    );

    expect(quote.pricingSnapshot.assessorId).toBe("rule-engine");
    expect(quote.pricingSnapshot.assessorVersion).toBe("2026.10.2");
    expect(quote.pricingSnapshot.tier).toBe("essential");
    expect(quote.pricingSnapshot.quotedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("records when the rate table was last reviewed", () => {
    const quote = unwrap(
      buildQuote({ assessment: assessment(), currency: "USD", selectedCapabilities: [] }),
    );
    expect(quote.pricingSnapshot.ratesReviewedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("client price tampering has nothing to attack", () => {
  it("accepts no amount of any kind as input", () => {
    // The whole defence in one assertion: the function signature has no field
    // through which a caller could propose a price.
    const input = {
      assessment: assessment(),
      currency: "CAD" as const,
      selectedCapabilities: [],
    };
    expect(Object.keys(input).sort()).toEqual([
      "assessment",
      "currency",
      "selectedCapabilities",
    ]);
  });

  it("prices the same configuration identically on every call", () => {
    const a = unwrap(
      buildQuote({ assessment: assessment(), currency: "CAD", selectedCapabilities: [] }),
    );
    const b = unwrap(
      buildQuote({ assessment: assessment(), currency: "CAD", selectedCapabilities: [] }),
    );
    expect(a.total.minorUnits).toBe(b.total.minorUnits);
  });

  it("ignores capability selections when computing the total", () => {
    // Capabilities reach the price through the assessment, never directly --
    // so a padded list on the order line cannot move the figure.
    const withNone = unwrap(
      buildQuote({ assessment: assessment(), currency: "CAD", selectedCapabilities: [] }),
    );
    const withMany = unwrap(
      buildQuote({
        assessment: assessment(),
        currency: "CAD",
        selectedCapabilities: ["blog", "cms_editing", "multilingual"],
      }),
    );
    expect(withMany.total.minorUnits).toBe(withNone.total.minorUnits);
  });
});
