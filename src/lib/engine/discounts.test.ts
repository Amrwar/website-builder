import { describe, expect, it } from "vitest";

import { money } from "@/lib/pricing/money";
import { applyDiscount, normaliseCode } from "./discounts";
import type { DiscountRule } from "./catalog";

/**
 * Coupons.
 *
 * A coupon is the one figure a customer types in themselves, which makes it
 * the obvious place to try things. Every test here is an attempt to get a
 * reduction the business did not offer.
 */

const NOW = new Date("2026-10-06T12:00:00Z");

function rule(overrides: Partial<DiscountRule> = {}): DiscountRule {
  return {
    code: "SAVE10",
    description: null,
    kind: "percentage",
    value: 10,
    maxDiscountMinorUnits: null,
    minOrderMinorUnits: null,
    appliesToBuildTypes: [],
    startsAt: null,
    endsAt: null,
    maxRedemptions: null,
    timesUsed: 0,
    isActive: true,
    ...overrides,
  };
}

function apply(
  code: string | null,
  discount: DiscountRule | null,
  subtotalMinorUnits = 40_000,
  buildType = "website",
) {
  return applyDiscount({
    subtotal: money(subtotalMinorUnits, "CAD"),
    discount,
    code,
    buildType,
    now: NOW,
  });
}

describe("codes are matched the way people type them", () => {
  it("ignores case and surrounding space", () => {
    expect(normaliseCode("  save10 ")).toBe("SAVE10");
    expect(apply("  save10 ", rule()).amount.minorUnits).toBe(4_000);
  });

  it("treats an empty code as no code at all", () => {
    expect(normaliseCode("   ")).toBeNull();
    expect(apply("", rule()).refusal).toBe("no_code");
  });
});

describe("a code the business did not issue buys nothing", () => {
  it("refuses when no rule was found", () => {
    const outcome = apply("FREESTUFF", null);
    expect(outcome.amount.minorUnits).toBe(0);
    expect(outcome.applied).toBeNull();
    expect(outcome.refusal).toBe("unknown");
  });

  it("refuses when the loaded rule is for a different code", () => {
    // Guards against a caller passing one code and a rule for another, which
    // is how a lookup bug becomes a free discount.
    expect(apply("OTHER", rule({ code: "SAVE10" })).refusal).toBe("unknown");
  });

  it("refuses a withdrawn code", () => {
    expect(apply("SAVE10", rule({ isActive: false })).refusal).toBe("inactive");
  });
});

describe("validity windows are enforced on the server clock", () => {
  it("refuses a campaign that has not started", () => {
    const outcome = apply("SAVE10", rule({ startsAt: new Date("2026-12-01T00:00:00Z") }));
    expect(outcome.refusal).toBe("not_started");
  });

  it("refuses a campaign that has ended", () => {
    const outcome = apply("SAVE10", rule({ endsAt: new Date("2026-01-01T00:00:00Z") }));
    expect(outcome.refusal).toBe("expired");
  });

  it("accepts one inside its window", () => {
    const outcome = apply(
      "SAVE10",
      rule({
        startsAt: new Date("2026-10-01T00:00:00Z"),
        endsAt: new Date("2026-11-01T00:00:00Z"),
      }),
    );
    expect(outcome.amount.minorUnits).toBe(4_000);
  });
});

describe("usage caps hold", () => {
  it("refuses an exhausted campaign", () => {
    const outcome = apply("SAVE10", rule({ maxRedemptions: 50, timesUsed: 50 }));
    expect(outcome.refusal).toBe("exhausted");
  });

  it("allows the last redemption", () => {
    const outcome = apply("SAVE10", rule({ maxRedemptions: 50, timesUsed: 49 }));
    expect(outcome.amount.minorUnits).toBe(4_000);
  });
});

describe("eligibility rules hold", () => {
  it("refuses a code scoped to a different build type", () => {
    const outcome = apply(
      "SAVE10",
      rule({ appliesToBuildTypes: ["mobileApp"] }),
      40_000,
      "website",
    );
    expect(outcome.refusal).toBe("wrong_build_type");
  });

  it("accepts a code scoped to this build type", () => {
    const outcome = apply(
      "SAVE10",
      rule({ appliesToBuildTypes: ["website", "system"] }),
      40_000,
      "website",
    );
    expect(outcome.amount.minorUnits).toBe(4_000);
  });

  it("refuses an order below the minimum", () => {
    const outcome = apply("SAVE10", rule({ minOrderMinorUnits: 100_000 }), 40_000);
    expect(outcome.refusal).toBe("below_minimum");
  });
});

describe("the reduction cannot be larger than the business allowed", () => {
  it("respects a cap on a percentage", () => {
    const outcome = apply(
      "SAVE10",
      rule({ value: 50, maxDiscountMinorUnits: 5_000 }),
      40_000,
    );
    expect(outcome.amount.minorUnits).toBe(5_000);
  });

  it("never exceeds the order value", () => {
    // A fixed 900 off a 400 order is not an 500 refund.
    const outcome = apply("SAVE10", rule({ kind: "fixed", value: 90_000 }), 40_000);
    expect(outcome.amount.minorUnits).toBe(40_000);
  });

  it("never produces a negative reduction", () => {
    const outcome = apply("SAVE10", rule({ kind: "fixed", value: 1 }), 40_000);
    expect(outcome.amount.minorUnits).toBeGreaterThanOrEqual(0);
  });

  it("reports a reduction that rounds to nothing as a refusal", () => {
    // A 1% coupon on a 0.01 order. Recording a zero-value discount on an
    // invoice is worse than saying the code did not apply.
    const outcome = apply("SAVE10", rule({ value: 1 }), 1);
    expect(outcome.amount.minorUnits).toBe(0);
    expect(outcome.applied).toBeNull();
  });
});

describe("what gets recorded", () => {
  it("names the code and the amount, for the invoice", () => {
    const outcome = apply("SAVE10", rule({ description: "Launch offer" }));
    expect(outcome.applied).toEqual({
      code: "SAVE10",
      kind: "percentage",
      amount: money(4_000, "CAD"),
      description: "Launch offer",
    });
  });

  it("records nothing when the code was refused", () => {
    expect(apply("SAVE10", rule({ isActive: false })).applied).toBeNull();
  });

  it("keeps the reduction in the charged currency", () => {
    const outcome = applyDiscount({
      subtotal: money(1_000_000, "EGP"),
      discount: rule(),
      code: "SAVE10",
      buildType: "website",
      now: NOW,
    });
    expect(outcome.amount.currency).toBe("EGP");
  });
});
