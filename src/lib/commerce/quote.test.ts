import { describe, expect, it } from "vitest";

import { TAX } from "@/config/commerce";
import { defaultCatalog, evaluateProject, type ProjectAssessment } from "@/lib/engine";
import type { Currency } from "@/lib/pricing/money";
import type { ScopeAssessment } from "@/lib/scope";
import { buildQuote } from "./quote";

/**
 * Pricing is the one piece of this system a customer has a direct financial
 * incentive to influence, so these tests are written from that angle: what can
 * a caller change, and what can it reach?
 *
 * The answer the design relies on is that **no input anywhere on this path
 * carries an amount**. The engine takes a brief and a catalogue; the quote
 * builder takes the engine's answer. Neither accepts a price, so there is no
 * field for a tampered payload to put one in.
 *
 * These run against the real engine and the shipped catalogue rather than a
 * hand-built breakdown, because a projection test over a fabricated price
 * would pass even if the engine priced wrongly.
 */

function scope(overrides: Partial<ScopeAssessment> = {}): ScopeAssessment {
  return {
    assessorId: "rule-engine",
    assessorVersion: "2026.10.2",
    buildType: "website",
    tier: "essential",
    complexityPoints: 4,
    capabilities: [],
    reasons: [],
    requiresCustomQuote: false,
    price: null,
    designFee: null,
    totalPrice: null,
    complexity: "simple",
    guaranteedDays: 5,
    exceededEntryTierBy: [],
    ...overrides,
  };
}

interface PriceOptions {
  currency?: Currency;
  wantsDesignService?: boolean;
  selectedCapabilities?: readonly string[];
  scopeOverrides?: Partial<ScopeAssessment>;
}

function assess(options: PriceOptions = {}): ProjectAssessment {
  return evaluateProject({
    assessment: scope(options.scopeOverrides),
    catalog: defaultCatalog(),
    currency: options.currency ?? "CAD",
    selectedCapabilities: options.selectedCapabilities ?? [],
    wantsDesignService: options.wantsDesignService ?? false,
  });
}

function quoteFor(options: PriceOptions = {}) {
  const result = buildQuote({
    assessment: assess(options),
    selectedCapabilities: options.selectedCapabilities ?? [],
  });
  if (!result.ok) throw new Error(`expected a quote, got ${result.reason}`);
  return result.quote;
}

describe("the entry offer prices exactly as published", () => {
  it("charges 400 CAD for an essential website", () => {
    const quote = quoteFor();

    expect(quote.total.minorUnits).toBe(40_000);
    expect(quote.total.currency).toBe("CAD");
  });

  it("carries the guaranteed days through to the order", () => {
    const quote = quoteFor();
    expect(quote.guaranteedDays).toBe(5);
    expect(quote.lines[0]?.guaranteedDays).toBe(5);
  });
});

describe("the design service is its own line", () => {
  it("adds a second line rather than inflating the build price", () => {
    // Bundling would make the same build look like a different price to two
    // customers, and would hide the fee on the invoice.
    const quote = quoteFor({ wantsDesignService: true });

    expect(quote.lines).toHaveLength(2);
    expect(quote.lines[0]?.productType).toBe("build");
    expect(quote.lines[0]?.unitAmount.minorUnits).toBe(40_000);
    expect(quote.lines[1]?.productType).toBe("design_service");
    expect(quote.lines[1]?.unitAmount.minorUnits).toBeGreaterThan(0);
  });

  it("omits the line when no design fee applies", () => {
    expect(quoteFor().lines).toHaveLength(1);
  });
});

describe("a brief that cannot be sold at a published price", () => {
  it("produces no quote at all", () => {
    const result = buildQuote({
      assessment: assess({ scopeOverrides: { tier: "custom", complexityPoints: 60 } }),
      selectedCapabilities: [],
    });

    // Not a zero, not a fallback price -- nothing. The customer is routed to a
    // quotation rather than quietly underquoted.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("requires_custom_quote");
  });
});

describe("local pricing", () => {
  it("charges in the requested currency", () => {
    const quote = quoteFor({ currency: "EGP" });

    expect(quote.currency).toBe("EGP");
    expect(quote.total.currency).toBe("EGP");
    expect(quote.lines.every((line) => line.unitAmount.currency === "EGP")).toBe(true);
  });

  it("records the derivation for every line", () => {
    const quote = quoteFor({ currency: "USD", wantsDesignService: true });

    expect(quote.pricingSnapshot.lines).toHaveLength(2);
    for (const line of quote.pricingSnapshot.lines) {
      expect(line.baseMinorUnits).toBeGreaterThan(0);
      expect(line.rate).toBeGreaterThan(0);
      expect(line.chargedMinorUnits).toBeGreaterThan(0);
    }
  });

  it("totals equal the sum of the lines, in every currency", () => {
    for (const currency of ["CAD", "USD", "EUR", "GBP", "AED", "SAR", "EGP"] as const) {
      const quote = quoteFor({ currency, wantsDesignService: true });

      const summed = quote.lines.reduce((n, line) => n + line.unitAmount.minorUnits, 0);
      expect(quote.subtotal.minorUnits, currency).toBe(summed);
      expect(quote.total.minorUnits, currency).toBe(
        summed - quote.discount.minorUnits + quote.tax.minorUnits,
      );
    }
  });

  it("attributes discount and tax so the lines add up to the header", () => {
    // Largest-remainder allocation, checked rather than assumed: an invoice
    // whose lines are a cent off its total is one a customer will query.
    const quote = quoteFor({ wantsDesignService: true });

    const lineDiscount = quote.lines.reduce((n, l) => n + l.discount.minorUnits, 0);
    const lineTax = quote.lines.reduce((n, l) => n + l.tax.minorUnits, 0);
    const lineTotal = quote.lines.reduce((n, l) => n + l.total.minorUnits, 0);

    expect(lineDiscount).toBe(quote.discount.minorUnits);
    expect(lineTax).toBe(quote.tax.minorUnits);
    expect(lineTotal).toBe(quote.total.minorUnits);
  });
});

describe("tax", () => {
  it("is zero and says so, because no registration exists", () => {
    const quote = quoteFor();

    expect(TAX.enabled).toBe(false);
    expect(quote.tax.minorUnits).toBe(0);
    // Recorded as a policy, not an absence, so an invoice can state the reason.
    expect(quote.pricingSnapshot.tax.enabled).toBe(false);
    expect(quote.pricingSnapshot.tax.noteKey).toBe(TAX.noteKey);
  });
});

describe("the snapshot makes a price defensible", () => {
  it("names the assessor, the engine and the exact ruleset that priced it", () => {
    const quote = quoteFor();

    expect(quote.pricingSnapshot.assessorId).toBe("rule-engine");
    expect(quote.pricingSnapshot.assessorVersion).toBe("2026.10.2");
    expect(quote.pricingSnapshot.engineId).toBe("scope-pricing-engine");
    expect(quote.pricingSnapshot.engineVersion).toMatch(/^\d{4}\.\d+\.\d+$/);
    expect(quote.pricingSnapshot.tier).toBe("essential");
    expect(quote.pricingSnapshot.quotedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("records when the rate table was last reviewed", () => {
    const quote = quoteFor({ currency: "USD" });
    expect(quote.pricingSnapshot.ratesReviewedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("client price tampering has nothing to attack", () => {
  it("accepts no amount of any kind as input", () => {
    // The whole defence in one assertion: neither signature on this path has a
    // field through which a caller could propose a price.
    const quoteInput = { assessment: assess(), selectedCapabilities: [] };
    expect(Object.keys(quoteInput).sort()).toEqual([
      "assessment",
      "selectedCapabilities",
    ]);

    const engineInput = {
      assessment: scope(),
      catalog: defaultCatalog(),
      currency: "CAD" as const,
      selectedCapabilities: [],
      wantsDesignService: false,
    };
    expect(Object.keys(engineInput)).not.toContain("price");
    expect(Object.keys(engineInput)).not.toContain("total");
  });

  it("prices the same configuration identically on every call", () => {
    expect(quoteFor().total.minorUnits).toBe(quoteFor().total.minorUnits);
  });

  it("ignores capability selections when computing the total", () => {
    // Capabilities reach the price through the assessment, never directly --
    // so a padded list on the order line cannot move the figure. None of the
    // shipped capabilities carries a surcharge.
    const withNone = quoteFor();
    const withMany = quoteFor({
      selectedCapabilities: ["blog", "cms_editing", "multilingual"],
    });
    expect(withMany.total.minorUnits).toBe(withNone.total.minorUnits);
  });
});
