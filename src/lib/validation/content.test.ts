import { describe, expect, it } from "vitest";

import { MIN_VISITORS_FOR_READING, defaultCaptureMode } from "@/config/validation";
import {
  computeSignals,
  emptyContent,
  firstIncompleteStep,
  prefillFromValidation,
  validateStep,
  validationContentSchema,
  type ValidationContent,
} from "./content";

function complete(overrides: Partial<ValidationContent> = {}): ValidationContent {
  return {
    ...emptyContent("en"),
    businessName: "Little Loaves",
    oneLiner: "Fresh sourdough delivered to your door every Saturday.",
    description: "A weekly bread subscription baked in Laval and delivered by bike.",
    targetCustomer: "Families in Laval",
    headline: "Saturday bread, at your door",
    benefits: ["Baked that morning"],
    price: { model: "monthly", amount: 32, currency: "CAD" },
    ...overrides,
  };
}

describe("validation content", () => {
  it("accepts a complete test", () => {
    expect(validationContentSchema.safeParse(complete()).success).toBe(true);
    expect(firstIncompleteStep(complete())).toBeNull();
  });

  it("refuses links anywhere a visitor would read them", () => {
    for (const field of ["headline", "details", "oneLiner"] as const) {
      const content = complete({ [field]: "Order at https://example.com today" });
      expect(validationContentSchema.safeParse(content).success, field).toBe(false);
    }
    expect(validateStep("offer", complete({ details: "see www.example.com" }))).toBe(
      "links",
    );
    expect(validateStep("offer", complete({ benefits: ["Visit www.example.com"] }))).toBe(
      "links",
    );
  });

  it("asks for a price only when one is to be shown", () => {
    expect(
      validateStep(
        "pricing",
        complete({ price: { model: "none", amount: null, currency: "CAD" } }),
      ),
    ).toBeNull();
    expect(
      validateStep(
        "pricing",
        complete({ price: { model: "one_time", amount: null, currency: "CAD" } }),
      ),
    ).toBe("needPrice");
    expect(
      validateStep(
        "pricing",
        complete({ price: { model: "monthly", amount: 0, currency: "CAD" } }),
      ),
    ).toBe("needPrice");
  });

  it("reports each step's own problem, and only its own", () => {
    const empty = emptyContent("en");
    expect(validateStep("idea", empty)).toBe("needName");
    expect(validateStep("description", empty)).toBe("describeMore");
    expect(validateStep("customer", empty)).toBe("needCustomer");
    expect(validateStep("offer", empty)).toBe("needHeadline");
    // Pricing is fine on an empty draft: "no price" is the default.
    expect(validateStep("pricing", empty)).toBeNull();
    expect(validateStep("publish", empty)).toBe("completeEarlierSteps");
    expect(firstIncompleteStep(empty)).toBe("idea");
  });

  it("suggests a waitlist only for something not yet available", () => {
    expect(defaultCaptureMode("soon")).toBe("waitlist");
    expect(defaultCaptureMode("now")).toBe("inquiry");
  });
});

describe("signals", () => {
  it("has no ratios without visitors, rather than 0%", () => {
    const signals = computeSignals({
      visitors: 0,
      views: 0,
      ctaClicks: 0,
      inquiries: 0,
      signups: 0,
    });
    expect(signals.conversionRate).toBeNull();
    expect(signals.clickThroughRate).toBeNull();
    expect(signals.reading).toBe("too_early");
  });

  it("counts inquiries and sign-ups as leads over unique visitors", () => {
    const signals = computeSignals({
      visitors: 200,
      views: 260,
      ctaClicks: 40,
      inquiries: 6,
      signups: 4,
    });
    expect(signals.leads).toBe(10);
    expect(signals.conversionRate).toBeCloseTo(0.05);
    expect(signals.clickThroughRate).toBeCloseTo(0.2);
    expect(signals.reading).toBe("readable");
  });

  it("never reports more than 100%", () => {
    const signals = computeSignals({
      visitors: 2,
      views: 2,
      ctaClicks: 5,
      inquiries: 3,
      signups: 0,
    });
    expect(signals.conversionRate).toBe(1);
    expect(signals.clickThroughRate).toBe(1);
  });

  it("calls a small sample too early, whatever its percentage", () => {
    const below = computeSignals({
      visitors: MIN_VISITORS_FOR_READING - 1,
      views: 120,
      ctaClicks: 60,
      inquiries: 40,
      signups: 0,
    });
    expect(below.reading).toBe("too_early");
  });
});

describe("into Business-in-a-Box", () => {
  it("carries the customer's own words, unchanged", () => {
    const content = complete({ blueprintKey: "restaurant" });
    expect(prefillFromValidation(content)).toEqual({
      blueprintKey: "restaurant",
      businessName: "Little Loaves",
      targetCustomers: "Families in Laval",
      offering: content.description,
    });
  });
});
