import { describe, expect, it } from "vitest";

import { buildQuote } from "@/lib/commerce/quote";
import type { ScopeAssessment } from "@/lib/scope";
import { defaultCatalog, type Catalog, type TierRule } from "./catalog";
import { deliveryFor, evaluateProject } from "./evaluate";

/**
 * The engine's edge cases.
 *
 * Written as the attacks and the awkward realities rather than as a tour of
 * the happy path: a customer with a financial incentive, an administrator with
 * a fat finger, a brief that does not fit the price list, and an order from
 * six months ago that still has to add up.
 */

function scope(overrides: Partial<ScopeAssessment> = {}): ScopeAssessment {
  return {
    assessorId: "rule-engine",
    assessorVersion: "2026.10.2",
    buildType: "website",
    tier: "essential",
    complexityPoints: 0,
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

function evaluate(
  assessment: ScopeAssessment,
  catalog: Catalog = defaultCatalog(),
  options: { discountCode?: string | null; wantsDesignService?: boolean } = {},
) {
  return evaluateProject({
    assessment,
    catalog,
    currency: "CAD",
    selectedCapabilities: assessment.capabilities.map((entry) => entry.key),
    wantsDesignService: options.wantsDesignService ?? false,
    discountCode: options.discountCode ?? null,
  });
}

/** Replaces one tier row, leaving the rest of the catalogue alone. */
function withTier(catalog: Catalog, patch: Partial<TierRule> & Pick<TierRule, "tier">) {
  return {
    ...catalog,
    tiers: catalog.tiers.map((rule) =>
      rule.tier === patch.tier && rule.buildType === (patch.buildType ?? "website")
        ? { ...rule, ...patch }
        : rule,
    ),
  };
}

/* -------------------------------------------------------------------------
 * A fixed price is not unlimited scope
 * ---------------------------------------------------------------------- */

describe("complexity raises the price rather than the workload", () => {
  it("lifts the tier as points accumulate", () => {
    const essential = evaluate(scope({ complexityPoints: 4 }));
    const extended = evaluate(scope({ complexityPoints: 12 }));
    const advanced = evaluate(scope({ complexityPoints: 30 }));

    expect(essential.tier).toBe("essential");
    expect(extended.tier).toBe("extended");
    expect(advanced.tier).toBe("advanced");

    // The rule the whole business depends on: more scope costs more and takes
    // longer. Not more scope for the same price.
    const price = (result: ReturnType<typeof evaluate>) =>
      result.price?.total.minorUnits ?? 0;
    expect(price(extended)).toBeGreaterThan(price(essential));
    expect(price(advanced)).toBeGreaterThan(price(extended));
    expect(advanced.delivery.guaranteedDays!).toBeGreaterThan(
      essential.delivery.guaranteedDays!,
    );
  });

  it("routes extreme scope to a quotation instead of underquoting it", () => {
    const result = evaluate(scope({ complexityPoints: 10_000 }));

    expect(result.tier).toBe("custom");
    expect(result.band).toBe("custom");
    expect(result.requiresCustomQuote).toBe(true);
    // No price, no deadline, and therefore no guarantee. Not a capped price.
    expect(result.price).toBeNull();
    expect(result.delivery.guaranteedDays).toBeNull();
    expect(result.delivery.guaranteeApplies).toBe(false);
  });

  it("never lowers a tier the assessor insisted on", () => {
    // A capability with a hard floor -- payments, multi-role auth -- sets a
    // minimum the point total cannot undercut, however small the brief reads.
    const result = evaluate(scope({ complexityPoints: 0, tier: "advanced" }));
    expect(result.tier).toBe("advanced");
  });

  it("takes the higher of the two, not the assessor's", () => {
    const result = evaluate(scope({ complexityPoints: 10_000, tier: "essential" }));
    expect(result.tier).toBe("custom");
  });
});

/* -------------------------------------------------------------------------
 * Impossible and contradictory catalogues
 * ---------------------------------------------------------------------- */

describe("an incoherent catalogue degrades safely", () => {
  it("quotes rather than charging zero when a tier has no price", () => {
    const catalog = withTier(defaultCatalog(), {
      tier: "essential",
      priceMinorUnits: null,
      guaranteedDays: null,
    });

    const result = evaluate(scope({ complexityPoints: 0 }), catalog);

    expect(result.requiresCustomQuote).toBe(true);
    expect(result.price).toBeNull();
    // The failure mode that matters: a missing price must never become a free
    // build. An unsellable configuration is routed to a human.
    expect(buildQuote({ assessment: result, selectedCapabilities: [] }).ok).toBe(false);
  });

  it("withdraws a tier upward, never down to a cheaper one", () => {
    const catalog = withTier(defaultCatalog(), { tier: "extended", isActive: false });
    const result = evaluate(scope({ complexityPoints: 12 }), catalog);

    // 12 points sits in the withdrawn band. Falling through to `essential`
    // would sell moderate work at the entry price, so the ladder climbs.
    expect(result.tier).toBe("advanced");
    expect(result.price!.total.minorUnits).toBe(180_000);
  });

  it("quotes when every tier at or above the band is withdrawn", () => {
    let catalog = withTier(defaultCatalog(), { tier: "extended", isActive: false });
    catalog = withTier(catalog, { tier: "advanced", isActive: false });
    catalog = withTier(catalog, { tier: "custom", isActive: false });

    const result = evaluate(scope({ complexityPoints: 12 }), catalog);
    expect(result.requiresCustomQuote).toBe(true);
    expect(result.price).toBeNull();
  });

  it("refuses to guarantee work it could not price", () => {
    const delivery = deliveryFor("website", "advanced", null, false);
    expect(delivery.plan).toBe("quote");
    expect(delivery.guaranteeApplies).toBe(false);
  });

  it("keeps app store review outside the guarantee", () => {
    const result = evaluate(scope({ buildType: "mobileApp", complexityPoints: 2 }));
    expect(result.delivery.plan).toBe("guaranteed");
    // The review is somebody else's queue. Counting it would make the promise
    // one we cannot keep.
    expect(result.delivery.externalReviewExcluded).toBe(true);
  });
});

/* -------------------------------------------------------------------------
 * Delivery plans
 * ---------------------------------------------------------------------- */

describe("the delivery plan follows the promise, not a label", () => {
  /**
   * The plan says whether the product's own published guarantee holds, not how
   * many days it is. It used to be `five_day` / `fourteen_day`, which meant
   * every product with a different promise needed another member of the union
   * and another branch choosing it.
   */
  it("holds the guarantee when the days are within what the product publishes", () => {
    // Website publishes five days; app publishes fourteen. Same answer, from
    // each product's own figure rather than from a literal.
    expect(deliveryFor("website", "essential", 5, false).plan).toBe("guaranteed");
    expect(deliveryFor("mobileApp", "essential", 14, true).plan).toBe("guaranteed");
  });

  it("calls anything longer an extended build, per product", () => {
    expect(deliveryFor("website", "extended", 10, false).plan).toBe("extended");
    expect(deliveryFor("mobileApp", "advanced", 30, true).plan).toBe("extended");
  });

  it("does not judge one product by another product's promise", () => {
    // Ten days is extended for a website and well inside an app's guarantee.
    // The old code reached the same answer by branching on the id; this one
    // reaches it by reading what each product actually promises.
    expect(deliveryFor("website", "advanced", 10, false).plan).toBe("extended");
    expect(deliveryFor("mobileApp", "advanced", 10, true).plan).toBe("guaranteed");
  });

  it("moves between plans when an administrator edits the duration", () => {
    // Derived rather than stored, so a tier whose days are shortened stops
    // advertising itself as an extended build automatically.
    const catalog = withTier(defaultCatalog(), { tier: "extended", guaranteedDays: 5 });
    const result = evaluate(scope({ complexityPoints: 12 }), catalog);
    expect(result.delivery.plan).toBe("guaranteed");
    expect(result.requiresExtendedBuild).toBe(false);
  });
});

/* -------------------------------------------------------------------------
 * Price tampering
 * ---------------------------------------------------------------------- */

describe("a browser cannot influence the price", () => {
  it("ignores a price the caller tries to supply on the brief", () => {
    // The assessor's own price fields are not read: the catalogue decides.
    const tampered = scope({
      complexityPoints: 0,
      price: { minorUnits: 1, currency: "CAD" },
      totalPrice: { minorUnits: 1, currency: "CAD" },
      designFee: { minorUnits: 1, currency: "CAD" },
    });

    expect(evaluate(tampered).price?.total.minorUnits).toBe(40_000);
  });

  it("ignores a guaranteed duration supplied on the brief", () => {
    const tampered = scope({ complexityPoints: 0, guaranteedDays: 1 });
    expect(evaluate(tampered).delivery.guaranteedDays).toBe(5);
  });

  it("prices padded capability selections at the figure for the real scope", () => {
    const result = evaluateProject({
      assessment: scope({ complexityPoints: 0 }),
      catalog: defaultCatalog(),
      currency: "CAD",
      // A list the browser invented. None of these carry a surcharge, and the
      // tier came from the assessment, so the total cannot move.
      selectedCapabilities: ["blog", "hosted_checkout", "multi_role_access", "nope"],
      wantsDesignService: false,
    });

    expect(result.price?.total.minorUnits).toBe(40_000);
  });

  it("charges for a surcharge only when the catalogue carries one", () => {
    const catalog = defaultCatalog();
    const withSurcharge: Catalog = {
      ...catalog,
      features: catalog.features.map((feature) =>
        feature.key === "blog" ? { ...feature, surchargeMinorUnits: 5_000 } : feature,
      ),
    };

    const plain = evaluateProject({
      assessment: scope(),
      catalog,
      currency: "CAD",
      selectedCapabilities: ["blog"],
      wantsDesignService: false,
    });
    const charged = evaluateProject({
      assessment: scope(),
      catalog: withSurcharge,
      currency: "CAD",
      selectedCapabilities: ["blog"],
      wantsDesignService: false,
    });

    expect(plain.price?.total.minorUnits).toBe(40_000);
    expect(charged.price?.total.minorUnits).toBe(45_000);
  });
});

/* -------------------------------------------------------------------------
 * Currency
 * ---------------------------------------------------------------------- */

describe("currency", () => {
  it("never converts the base currency", () => {
    const result = evaluate(scope());
    const line = result.price!.lines[0]!;
    expect(line.conversion.rate).toBe(1);
    expect(line.amount.minorUnits).toBe(line.base.minorUnits);
  });

  it("uses the administrator's reviewed rate, not a shipped one", () => {
    const catalog = defaultCatalog();
    const edited: Catalog = {
      ...catalog,
      currencies: catalog.currencies.map((rule) =>
        rule.code === "USD"
          ? { ...rule, rate: 2, roundToMinorUnits: 100, reviewedOn: "2026-10-01" }
          : rule,
      ),
    };

    const result = evaluateProject({
      assessment: scope(),
      catalog: edited,
      currency: "USD",
      selectedCapabilities: [],
      wantsDesignService: false,
    });

    expect(result.price?.total.minorUnits).toBe(80_000);
    expect(result.price?.lines[0]?.conversion.ratesReviewedOn).toBe("2026-10-01");
  });

  it("falls back to the shipped rate when a currency is withdrawn", () => {
    // A deactivated row must not silently price at a rate of zero.
    const catalog = defaultCatalog();
    const withdrawn: Catalog = {
      ...catalog,
      currencies: catalog.currencies.map((rule) =>
        rule.code === "EGP" ? { ...rule, isActive: false } : rule,
      ),
    };

    const result = evaluateProject({
      assessment: scope(),
      catalog: withdrawn,
      currency: "EGP",
      selectedCapabilities: [],
      wantsDesignService: false,
    });

    expect(result.price!.total.minorUnits).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------
 * Historical pricing
 * ---------------------------------------------------------------------- */

describe("an order placed yesterday still adds up today", () => {
  it("is unaffected by a later catalogue edit", () => {
    const before = evaluate(scope());
    const snapshot = buildQuote({ assessment: before, selectedCapabilities: [] });
    if (!snapshot.ok) throw new Error("expected a quote");

    const raised = withTier(defaultCatalog(), {
      tier: "essential",
      priceMinorUnits: 99_900,
    });
    const after = evaluate(scope(), raised);

    // The new price is higher, and the frozen one has not moved.
    expect(after.price!.total.minorUnits).toBe(99_900);
    expect(snapshot.quote.total.minorUnits).toBe(40_000);
    expect(snapshot.quote.pricingSnapshot.lines[0]?.chargedMinorUnits).toBe(40_000);
  });

  it("records the engine and ruleset that produced the figure", () => {
    const result = evaluate(scope());
    expect(result.engineId).toBe("scope-pricing-engine");
    expect(result.engineVersion).toMatch(/^\d{4}\.\d+\.\d+$/);
    expect(result.assessorId).toBe("rule-engine");
  });

  it("is reproducible from the same inputs", () => {
    const now = new Date("2026-10-06T12:00:00Z");
    const a = evaluateProject({
      assessment: scope(),
      catalog: defaultCatalog(),
      currency: "CAD",
      selectedCapabilities: [],
      wantsDesignService: false,
      now,
    });
    const b = evaluateProject({
      assessment: scope(),
      catalog: defaultCatalog(),
      currency: "CAD",
      selectedCapabilities: [],
      wantsDesignService: false,
      now,
    });

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

/* -------------------------------------------------------------------------
 * Explanation
 * ---------------------------------------------------------------------- */

describe("the band explains itself", () => {
  it("states the band and the points behind it", () => {
    const result = evaluate(scope({ complexityPoints: 30 }));
    expect(result.explanation.band).toBe("advanced");
    expect(result.explanation.complexityPoints).toBe(30);
  });

  it("lists exclusions as plainly as inclusions", () => {
    const result = evaluate(scope());
    // Nothing was detected, so everything is excluded -- and the customer is
    // told so rather than left to infer it from a silence.
    expect(result.capabilities).toHaveLength(0);
    expect(result.excluded.length).toBeGreaterThan(0);
  });

  it("is rule-based and says which rules fired", () => {
    // No invented reasoning: the explanation is the assessor's own reason
    // codes, which is why the product can claim it is not an AI guess.
    const reasons = [
      {
        code: "multiple_user_types" as const,
        capabilityKeys: ["multi_role_access", "hosted_checkout"] as const,
      },
    ];
    const result = evaluate(scope({ complexityPoints: 30, reasons, tier: "advanced" }));

    expect(result.explanation.reasons).toHaveLength(1);
    expect(result.explanation.actorGroups).toBe(2);
  });
});
