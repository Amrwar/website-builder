import { describe, expect, it } from "vitest";

import { DESIGN_SERVICE } from "@/config/design";
import { defaultPlatformsFor, platformConflict } from "@/config/platforms";
import { toMajorUnits } from "@/lib/pricing/money";
import { assessScope } from "./index";
import type { ScopeInput } from "./types";

function input(overrides: Partial<ScopeInput> = {}): ScopeInput {
  return {
    buildType: "website",
    ideaText: "",
    locale: "en",
    selectedCapabilities: [],
    ...overrides,
  };
}

describe("design service pricing", () => {
  it("adds the fee only when the design service is chosen", async () => {
    const withDesign = await assessScope(input({ designApproach: "design_for_me" }));
    const supplied = await assessScope(input({ designApproach: "supplied_brand" }));

    expect(toMajorUnits(withDesign.designFee!)).toBe(50);
    expect(supplied.designFee).toBeNull();
  });

  it("keeps the build price separate from the design fee", async () => {
    // The published figure must stay the published figure; the service is an
    // addition to it, never folded into it.
    const result = await assessScope(input({ designApproach: "design_for_me" }));

    expect(toMajorUnits(result.price!)).toBe(400);
    expect(toMajorUnits(result.designFee!)).toBe(50);
    expect(toMajorUnits(result.totalPrice!)).toBe(450);
  });

  it("matches the configured fee rather than a hardcoded number", async () => {
    const result = await assessScope(input({ designApproach: "design_for_me" }));
    expect(result.designFee).toEqual(DESIGN_SERVICE.fee);
  });

  it("leaves the total null when a quotation is required", async () => {
    const result = await assessScope(
      input({
        buildType: "system",
        designApproach: "design_for_me",
        selectedCapabilities: ["marketplace_payouts"],
      }),
    );

    expect(result.requiresCustomQuote).toBe(true);
    expect(result.totalPrice).toBeNull();
  });
});

describe("platform effort", () => {
  it("treats cross-platform as the baseline", async () => {
    const result = await assessScope(
      input({ buildType: "mobileApp", platforms: ["cross_platform"] }),
    );
    expect(result.complexityPoints).toBe(0);
  });

  it("charges more complexity for two native targets than one codebase", async () => {
    const cross = await assessScope(
      input({ buildType: "mobileApp", platforms: ["cross_platform"] }),
    );
    const native = await assessScope(
      input({ buildType: "mobileApp", platforms: ["ios", "android"] }),
    );

    expect(native.complexityPoints).toBeGreaterThan(cross.complexityPoints);
  });
});

describe("impossible scope is rejected, not priced", () => {
  it("flags cross-platform combined with a native target", () => {
    // One codebase serving both stores and a separate native build are a
    // contradiction, not a larger order.
    expect(platformConflict("mobileApp", ["cross_platform", "ios"])).toBe(
      "cross_platform_with_native",
    );
  });

  it("flags an empty selection", () => {
    expect(platformConflict("mobileApp", [])).toBe("empty");
  });

  it("flags a platform the build type does not offer", () => {
    expect(platformConflict("website", ["ios"])).toBe("not_available");
  });

  it("accepts valid selections", () => {
    expect(platformConflict("mobileApp", ["ios", "android"])).toBe("none");
    expect(platformConflict("website", ["responsive_web"])).toBe("none");
  });

  it("defaults each build type to a valid selection", () => {
    for (const buildType of ["website", "system", "mobileApp"] as const) {
      expect(platformConflict(buildType, defaultPlatformsFor(buildType))).toBe("none");
    }
  });
});

describe("complexity band", () => {
  it("reports a plain brochure site as simple", async () => {
    const result = await assessScope(
      input({ ideaText: "A small site about my bakery." }),
    );
    expect(result.complexity).toBe("simple");
  });

  it("reports accumulated ordinary work as moderate or above", async () => {
    const result = await assessScope(
      input({
        buildType: "system",
        selectedCapabilities: ["product_catalog", "order_management"],
      }),
    );
    expect(["moderate", "advanced"]).toContain(result.complexity);
  });

  it("reports a heavy brief as advanced", async () => {
    const result = await assessScope(
      input({
        buildType: "system",
        selectedCapabilities: [
          "product_catalog",
          "inventory",
          "order_management",
          "admin_dashboard",
          "reporting",
        ],
      }),
    );
    expect(result.complexity).toBe("advanced");
  });

  it("does not call a light brief advanced just because one capability forces a tier", async () => {
    // Live tracking forces the custom tier, but the actual volume of work is
    // small; calling it "advanced" would overstate what is being bought.
    const result = await assessScope(
      input({
        buildType: "system",
        selectedCapabilities: ["realtime_location_tracking"],
      }),
    );

    expect(result.tier).toBe("custom");
    expect(result.complexity).not.toBe("simple");
  });
});

describe("intake context feeds detection", () => {
  it("reads capability signals from the industry and customer fields", async () => {
    // The paragraph alone says nothing; the context does.
    const result = await assessScope(
      input({
        buildType: "system",
        ideaText: "We need something for the business.",
        context: {
          industry: "Food delivery",
          targetCustomers: "Customers, our staff and our drivers",
          desiredOutcome: "Customers can track drivers in real time",
        },
      }),
    );

    const keys = result.capabilities.map((capability) => capability.key);
    expect(keys).toContain("multi_role_access");
    expect(result.tier).not.toBe("essential");
  });
});

describe("detection precision", () => {
  it("does not read a booking system into a contact form", async () => {
    // Regression: "a contact form so patients can request an appointment"
    // matched a bare "appointment", forced the extended tier and more than
    // doubled the price of a brochure site. Over-detection overcharges, which
    // is the one failure this product cannot afford.
    const result = await assessScope(
      input({
        ideaText:
          "A clinic website with a few pages, our services, and a contact form so patients can request an appointment.",
      }),
    );

    const keys = result.capabilities.map((capability) => capability.key);
    expect(keys).toContain("contact_forms");
    expect(keys).not.toContain("booking_scheduling");
    expect(result.tier).toBe("essential");
    expect(toMajorUnits(result.price!)).toBe(400);
  });

  it("still detects a genuine booking system", async () => {
    const result = await assessScope(
      input({
        ideaText: "We need an online booking system so clients can reserve a slot.",
      }),
    );

    expect(result.capabilities.map((c) => c.key)).toContain("booking_scheduling");
  });
});
