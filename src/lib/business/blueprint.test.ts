import { describe, expect, it } from "vitest";

import {
  BUSINESS_FEATURES,
  BUSINESS_GOALS,
  SHIPPED_BLUEPRINTS,
  SHIPPED_CATEGORIES,
  type BusinessFeatureId,
} from "@/config/business";
import { LOCALES } from "@/config/locales";
import { BUILD_PRODUCTS } from "@/config/products";
import ar from "@/messages/ar.json";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { draftSchema } from "@/lib/configurator/draft";
import { defaultCatalog, evaluateProject, totalPrice } from "@/lib/engine";
import { CAPABILITIES, assessScope } from "@/lib/scope";
import {
  blueprintDefinitionSchema,
  capabilitiesFor,
  definitionFromShipped,
  draftFromBlueprint,
  initialSelection,
  recommend,
  screensFor,
  type ResolvedBlueprint,
} from "./blueprint";

/**
 * Business-in-a-Box, end to end through the real engine.
 *
 * The property that matters most is the platform's first rule: a fixed
 * price is not unlimited scope. A blueprint is a shortcut to a large
 * selection, so these tests price every shipped blueprint with the same
 * scope engine and shipped catalogue the server uses and check that the
 * price moves with what was chosen.
 */

function resolved(key: string): ResolvedBlueprint {
  const shipped = SHIPPED_BLUEPRINTS.find((entry) => entry.key === key);
  if (!shipped) throw new Error(`no blueprint ${key}`);
  return {
    key,
    version: 0,
    categoryKey: shipped.categoryKey,
    buildType: shipped.buildType,
    recommended: shipped.recommended,
    optional: shipped.optional,
    name: key,
    summary: "",
  };
}

const DETAILS = {
  businessName: "Cedar",
  location: "Montréal",
  targetCustomers: "Families nearby",
  offering: "",
  goals: [],
};

function draftFor(key: string, selected: readonly BusinessFeatureId[]) {
  return draftFromBlueprint({
    blueprint: resolved(key),
    details: DETAILS,
    selected,
    locale: "en",
    goalSummary: "",
  });
}

/** What the server's `assessAndPrice` does, against the shipped catalogue. */
async function price(key: string, selected: readonly BusinessFeatureId[]) {
  const draft = draftFor(key, selected);
  if (!draft.buildType) throw new Error("no build type");
  const scope = await assessScope({
    buildType: draft.buildType,
    ideaText: draft.intake.description,
    locale: draft.locale,
    selectedCapabilities: draft.selectedCapabilities,
    estimatedScreens: draft.estimatedScreens ?? undefined,
    platforms: draft.platforms,
  });
  return evaluateProject({
    assessment: scope,
    catalog: defaultCatalog(),
    currency: "CAD",
    selectedCapabilities: draft.selectedCapabilities,
    wantsDesignService: false,
    discountCode: null,
  });
}

describe("the shipped catalogue", () => {
  const capabilityKeys = new Set(CAPABILITIES.map((capability) => capability.key));

  it("maps every feature onto capabilities the engine prices", () => {
    for (const feature of BUSINESS_FEATURES) {
      for (const key of feature.provides)
        expect(capabilityKeys, feature.id).toContain(key);
      // Only a plain page may be free of capabilities -- and then its screens
      // carry the cost. Anything else with neither would price as nothing.
      if (feature.provides.length === 0) {
        expect(feature.kind, feature.id).toBe("page");
        expect(feature.screens, feature.id).toBeGreaterThan(0);
      }
    }
  });

  it("has unique feature ids", () => {
    const ids = BUSINESS_FEATURES.map((feature) => feature.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ships thirteen valid blueprints with distinct keys", () => {
    expect(SHIPPED_BLUEPRINTS).toHaveLength(13);
    expect(new Set(SHIPPED_BLUEPRINTS.map((entry) => entry.key)).size).toBe(13);
    for (const blueprint of SHIPPED_BLUEPRINTS) {
      const parsed = blueprintDefinitionSchema.safeParse(
        definitionFromShipped(blueprint),
      );
      expect(parsed.success, blueprint.key).toBe(true);
      expect(SHIPPED_CATEGORIES, blueprint.key).toContain(blueprint.categoryKey);
    }
  });

  it("only lets goals promote features that exist", () => {
    const ids = new Set<string>(BUSINESS_FEATURES.map((feature) => feature.id));
    for (const goal of BUSINESS_GOALS) {
      for (const id of goal.promotes) expect(ids, goal.id).toContain(id);
    }
  });

  it("has every name in all three catalogues", () => {
    for (const [locale, messages] of [
      ["en", en],
      ["fr", fr],
      ["ar", ar],
    ] as const) {
      const copy = messages.blueprints;
      for (const blueprint of SHIPPED_BLUEPRINTS) {
        const item = copy.items[blueprint.key];
        expect(item?.name, `${locale} ${blueprint.key}`).toBeTruthy();
        expect(item?.summary, `${locale} ${blueprint.key}`).toBeTruthy();
      }
      for (const feature of BUSINESS_FEATURES) {
        const entry = copy.features[feature.id];
        expect(entry?.name, `${locale} ${feature.id}`).toBeTruthy();
        expect(entry?.description, `${locale} ${feature.id}`).toBeTruthy();
      }
      for (const goal of BUSINESS_GOALS) {
        expect(copy.goals[goal.id], `${locale} ${goal.id}`).toBeTruthy();
      }
      for (const category of SHIPPED_CATEGORIES) {
        expect(copy.categories[category], `${locale} ${category}`).toBeTruthy();
      }
    }
    expect(LOCALES).toHaveLength(3);
  });
});

describe("recommendation", () => {
  it("starts from the blueprint, with not-needed as the default", () => {
    const levels = Object.fromEntries(
      recommend(resolved("barber"), []).map((entry) => [entry.feature.id, entry.level]),
    );
    expect(levels.online_booking).toBe("recommended");
    expect(levels.payments).toBe("optional");
    expect(levels.online_ordering).toBe("not_needed");
  });

  it("moves a feature one level for a goal, and says which goal", () => {
    const entries = recommend(resolved("barber"), ["sell_online"]);
    const payments = entries.find((entry) => entry.feature.id === "payments");
    const store = entries.find((entry) => entry.feature.id === "online_store");
    // Optional becomes recommended...
    expect(payments).toMatchObject({ level: "recommended", promotedBy: ["sell_online"] });
    // ...but not-needed only becomes optional: a barber who wants to sell
    // online is shown a shop, not sold one.
    expect(store).toMatchObject({ level: "optional", promotedBy: ["sell_online"] });
  });

  it("moves a feature once however many goals argue for it", () => {
    const entries = recommend(resolved("freelancer"), ["sell_online", "take_payments"]);
    expect(entries.find((entry) => entry.feature.id === "payments")?.level).toBe(
      "recommended",
    );
    const store = entries.find((entry) => entry.feature.id === "online_store");
    expect(store?.level).toBe("optional");
  });

  it("reports no reason when a goal changed nothing", () => {
    const entries = recommend(resolved("restaurant"), ["take_payments"]);
    expect(entries.find((entry) => entry.feature.id === "payments")?.promotedBy).toEqual(
      [],
    );
  });

  it("switches on exactly the recommended set", () => {
    const blueprint = resolved("restaurant");
    expect(initialSelection(recommend(blueprint, [])).sort()).toEqual(
      [...blueprint.recommended].sort(),
    );
  });
});

describe("into a configurator draft", () => {
  it("produces a draft the configurator and the server both accept", () => {
    for (const blueprint of SHIPPED_BLUEPRINTS) {
      const draft = draftFor(blueprint.key, blueprint.recommended);
      const parsed = draftSchema.safeParse(draft);
      expect(parsed.success, blueprint.key).toBe(true);
      expect(draft.buildType).toBe(blueprint.buildType);
      expect(draft.blueprint).toMatchObject({ key: blueprint.key, version: 0 });
    }
  });

  it("charges for a shared capability once", () => {
    const keys = capabilitiesFor(["online_ordering", "online_store", "payments"]);
    expect(keys.filter((key) => key === "hosted_checkout")).toHaveLength(1);
    expect(keys.filter((key) => key === "product_catalog")).toHaveLength(1);
  });

  it("counts screens, within the schema's bounds", () => {
    expect(screensFor([])).toBe(1);
    expect(screensFor(["home", "about", "portfolio"])).toBe(4);
  });

  it("leaves design for the configurator to ask", () => {
    expect(draftFor("barber", ["home"]).design.approach).toBeNull();
  });
});

describe("a fixed price is not unlimited scope", () => {
  it("prices every shipped blueprint's recommended set", async () => {
    for (const blueprint of SHIPPED_BLUEPRINTS) {
      const assessment = await price(blueprint.key, blueprint.recommended);
      // Either a real figure or an explicit quote -- never silently nothing.
      expect(
        assessment.requiresCustomQuote || totalPrice(assessment) !== null,
        blueprint.key,
      ).toBe(true);
    }
  });

  it("does not let a full restaurant resolve to the entry price", async () => {
    const restaurant = await price("restaurant", resolved("restaurant").recommended);
    const entry = BUILD_PRODUCTS.system.basePrice.minorUnits;
    const total = totalPrice(restaurant);
    expect(restaurant.requiresCustomQuote || (total?.minorUnits ?? 0) > entry).toBe(true);
    expect(restaurant.tier).not.toBe("essential");
  });

  it("charges more as features are added, never less", async () => {
    const small = await price("barber", ["home", "contact"]);
    const large = await price("barber", [
      "home",
      "contact",
      "online_booking",
      "customer_accounts",
      "memberships",
      "analytics",
    ]);
    const smallTotal = totalPrice(small)?.minorUnits ?? 0;
    const largeTotal = totalPrice(large)?.minorUnits ?? Number.POSITIVE_INFINITY;
    expect(large.requiresCustomQuote || largeTotal > smallTotal).toBe(true);
  });

  it("routes crew dispatch to a quotation, with no guarantee", async () => {
    const assessment = await price("cleaning_company", [
      ...resolved("cleaning_company").recommended,
      "dispatch",
    ]);
    expect(assessment.requiresCustomQuote).toBe(true);
    expect(assessment.delivery.guaranteeApplies).toBe(false);
  });
});

describe("the definition schema", () => {
  const base = definitionFromShipped(SHIPPED_BLUEPRINTS[0]);

  it("refuses a feature listed at two levels", () => {
    const result = blueprintDefinitionSchema.safeParse({
      ...base,
      optional: [...base.optional, base.recommended[0]],
    });
    expect(result.success).toBe(false);
  });

  it("refuses a blueprint that recommends nothing", () => {
    expect(
      blueprintDefinitionSchema.safeParse({ ...base, recommended: [] }).success,
    ).toBe(false);
  });

  it("refuses a feature that does not exist", () => {
    expect(
      blueprintDefinitionSchema.safeParse({ ...base, optional: ["teleportation"] })
        .success,
    ).toBe(false);
  });

  it("refuses copy missing a language", () => {
    const copy = { en: { name: "Bakery", summary: "Bread, cakes and pre-orders." } };
    expect(blueprintDefinitionSchema.safeParse({ ...base, copy }).success).toBe(false);
  });
});
