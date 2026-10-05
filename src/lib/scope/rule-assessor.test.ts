import { describe, expect, it } from "vitest";

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

const keysOf = (result: { capabilities: readonly { key: string }[] }) =>
  result.capabilities.map((c) => c.key);

describe("entry-tier briefs stay at the published price", () => {
  it("prices a plain brochure site at the entry tier", async () => {
    const result = await assessScope(
      input({
        ideaText:
          "I need a simple website for my bakery with a few pages about us, our story and a contact form.",
      }),
    );

    expect(result.tier).toBe("essential");
    expect(result.requiresCustomQuote).toBe(false);
    expect(result.guaranteedDays).toBe(5);
    expect(toMajorUnits(result.price!)).toBe(400);
    expect(result.reasons).toEqual([]);
  });

  it("keeps hosted payments inside the entry tier", async () => {
    // Deliberate commercial decision: taking card payments through a hosted
    // page is not, by itself, a bigger build.
    const result = await assessScope(
      input({ ideaText: "A small site where customers can pay online for a workshop." }),
    );

    expect(keysOf(result)).toContain("hosted_checkout");
    expect(result.tier).toBe("essential");
  });

  it("treats an empty brief as the entry tier rather than guessing", async () => {
    const result = await assessScope(input());
    expect(result.tier).toBe("essential");
    expect(result.capabilities).toEqual([]);
  });
});

describe("the restaurant brief from the product definition", () => {
  // The worked example: it must exceed a 5-day build, and must say why.
  const RESTAURANT =
    "I want a restaurant system where customers order food, pay online, " +
    "restaurant staff manage orders, drivers manage deliveries, and customers track drivers.";

  it("does not qualify for a 5-Day Build", async () => {
    const result = await assessScope(
      input({ buildType: "system", ideaText: RESTAURANT }),
    );

    expect(result.tier).not.toBe("essential");
    expect(result.tier).toBe("custom");
  });

  it("routes to a custom quotation instead of publishing a price", async () => {
    const result = await assessScope(
      input({ buildType: "system", ideaText: RESTAURANT }),
    );

    expect(result.requiresCustomQuote).toBe(true);
    expect(result.price).toBeNull();
    expect(result.guaranteedDays).toBeNull();
  });

  it("identifies the capabilities that make it larger", async () => {
    const result = await assessScope(
      input({ buildType: "system", ideaText: RESTAURANT }),
    );
    const keys = keysOf(result);

    expect(keys).toContain("multi_role_access");
    expect(keys).toContain("realtime_location_tracking");
    expect(keys).toContain("dispatch_logistics");
    expect(keys).toContain("order_management");
    expect(keys).toContain("hosted_checkout");
  });

  it("explains itself with evidence the customer can check", async () => {
    const result = await assessScope(
      input({ buildType: "system", ideaText: RESTAURANT }),
    );

    expect(result.exceededEntryTierBy.length).toBeGreaterThan(0);
    expect(result.reasons.map((r) => r.code)).toContain("multiple_user_types");

    // Every text-derived conclusion must cite the phrase that produced it,
    // otherwise the assessment cannot be argued with.
    const textMatches = result.capabilities.filter((c) => c.method === "text_match");
    expect(textMatches.length).toBeGreaterThan(0);
    for (const match of textMatches) {
      expect(match.evidence, `${match.key} has no evidence`).toBeTruthy();
    }
  });

  it("reaches the same verdict in French", async () => {
    const result = await assessScope(
      input({
        buildType: "system",
        locale: "fr",
        ideaText:
          "Je veux un système de restaurant où les clients commandent des plats, " +
          "paient en ligne, le personnel gère les commandes, les livreurs gèrent " +
          "les livraisons et les clients suivent les livreurs.",
      }),
    );

    expect(result.tier).toBe("custom");
    expect(keysOf(result)).toContain("multi_role_access");
  });

  it("reaches the same verdict in Arabic", async () => {
    const result = await assessScope(
      input({
        buildType: "system",
        locale: "ar",
        ideaText:
          "أريد نظامًا لمطعم يطلب فيه العملاء الطعام ويدفعون عبر الإنترنت، " +
          "ويدير الموظفون الطلبات، ويدير السائقون التوصيل، ويتابع العملاء السائقين.",
      }),
    );

    expect(result.tier).toBe("custom");
    expect(keysOf(result)).toContain("multi_role_access");
  });
});

describe("multi-role inference", () => {
  it("does not fire for customers plus an admin", async () => {
    // The shape of almost every ordinary application; it must stay affordable.
    const result = await assessScope(
      input({
        ideaText: "Customers can book a table and an admin can see the bookings.",
      }),
    );

    expect(keysOf(result)).not.toContain("multi_role_access");
  });

  it("fires once three distinct kinds of person are described", async () => {
    const result = await assessScope(
      input({
        buildType: "system",
        ideaText:
          "Customers book lessons, teachers manage their schedule, and admins approve payouts.",
      }),
    );

    expect(keysOf(result)).toContain("multi_role_access");
  });

  it("counts synonyms of one role only once", async () => {
    // driver / courier / rider are the same group, so this is two groups.
    const result = await assessScope(
      input({ ideaText: "Customers see when the driver, courier or rider is close." }),
    );

    expect(keysOf(result)).not.toContain("multi_role_access");
  });
});

describe("implications", () => {
  it("pulls in the roles a marketplace necessarily needs", async () => {
    const result = await assessScope(
      input({ buildType: "system", selectedCapabilities: ["marketplace_payouts"] }),
    );

    const implied = result.capabilities.find((c) => c.key === "multi_role_access");
    expect(implied?.method).toBe("implied");
    expect(implied?.impliedBy).toBe("marketplace_payouts");
    expect(result.requiresCustomQuote).toBe(true);
  });

  it("resolves implications transitively", async () => {
    const result = await assessScope(
      input({
        buildType: "system",
        selectedCapabilities: ["realtime_location_tracking"],
      }),
    );

    // tracking -> live_updates, and tracking is custom tier on its own.
    expect(keysOf(result)).toContain("live_updates");
    expect(result.tier).toBe("custom");
  });
});

describe("tier floors versus accumulated points", () => {
  it("lifts a tier on one hard capability even when nothing else is asked for", async () => {
    const result = await assessScope(
      input({ buildType: "system", selectedCapabilities: ["dispatch_logistics"] }),
    );

    expect(result.tier).toBe("custom");
  });

  it("lifts a tier on accumulated ordinary work", async () => {
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

    expect(result.tier).not.toBe("essential");
    expect(result.complexityPoints).toBeGreaterThanOrEqual(25);
    expect(result.reasons.map((r) => r.code)).toContain("accumulated_complexity");
  });

  it("adds complexity for screen volume beyond the allowance", async () => {
    const lean = await assessScope(input({ estimatedScreens: 5 }));
    const heavy = await assessScope(input({ estimatedScreens: 30 }));

    expect(lean.complexityPoints).toBe(0);
    expect(heavy.complexityPoints).toBeGreaterThan(0);
  });

  it("does not let page count alone force a custom quote", async () => {
    // Volume is capped: a hundred-page brochure site is still a brochure site.
    const result = await assessScope(input({ estimatedScreens: 500 }));
    expect(result.requiresCustomQuote).toBe(false);
  });
});

describe("build-type scoping", () => {
  it("ignores mobile-only capabilities on a website brief", async () => {
    const result = await assessScope(
      input({ buildType: "website", selectedCapabilities: ["offline_sync"] }),
    );

    expect(keysOf(result)).not.toContain("offline_sync");
    expect(result.tier).toBe("essential");
  });

  it("honours them on a mobile brief", async () => {
    const result = await assessScope(
      input({ buildType: "mobileApp", selectedCapabilities: ["offline_sync"] }),
    );

    expect(keysOf(result)).toContain("offline_sync");
    expect(result.tier).toBe("custom");
  });

  it("prices an entry-tier mobile MVP at the published figure", async () => {
    const result = await assessScope(input({ buildType: "mobileApp" }));

    expect(toMajorUnits(result.price!)).toBe(600);
    expect(result.guaranteedDays).toBe(14);
  });
});

describe("assessment provenance", () => {
  it("records which assessor and ruleset produced the result", async () => {
    const result = await assessScope(input());

    expect(result.assessorId).toBe("rule-engine");
    // Pinned so a past quote stays attributable after the rules change.
    expect(result.assessorVersion).toMatch(/^\d{4}\.\d{1,2}\.\d+$/);
  });

  it("ignores capability keys it does not recognise", async () => {
    const result = await assessScope(
      input({ selectedCapabilities: ["not_a_real_capability", "cms_editing"] }),
    );

    expect(keysOf(result)).toEqual(["cms_editing"]);
  });
});
