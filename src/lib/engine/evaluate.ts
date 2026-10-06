import { TAX } from "@/config/commerce";
import type { BuildType } from "@/config/products";
import type { ScopeTierId } from "@/db/schema/enums";
import { localizePrice } from "@/lib/pricing/localize";
import {
  BASE_CURRENCY,
  money,
  sumMoney,
  type Currency,
  type Money,
} from "@/lib/pricing/money";
import type { CapabilityKey, ScopeAssessment } from "@/lib/scope";
import { applyDiscount } from "./discounts";
import {
  currencyRule,
  featureRule,
  tierForPoints,
  tierRule,
  type Catalog,
} from "./catalog";
import {
  BAND_BY_TIER,
  type Delivery,
  type DeliveryPlan,
  type EngineInputs,
  type PriceBreakdown,
  type PriceLine,
  type ProjectAssessment,
  type ScopeExplanation,
} from "./types";

/**
 * The scope and pricing engine.
 *
 * Authoritative and pure. Every surface -- the configurator, checkout, the
 * Build Room, the admin console, and whatever product types arrive later --
 * calls this one function and gets one answer. Before it existed, the
 * configurator and the order service each assembled scope and price
 * separately, which is two places for the same number to be wrong in.
 *
 * Nothing here reads a clock, a database or an environment variable. The
 * catalogue and the time are arguments, so an assessment is reproducible: the
 * same brief, catalogue and instant always produce the same price, which is
 * what makes a stored snapshot defensible months later.
 *
 * **The server decides the price.** There is no parameter through which a
 * caller can propose one. A tampered payload can at most describe a different
 * project, which is then priced correctly for what it describes.
 */

export const ENGINE_ID = "scope-pricing-engine";
export const ENGINE_VERSION = "2026.10.1";

export interface EvaluateInput extends EngineInputs {
  /** The scope assessment produced by the active `ScopeAssessor`. */
  assessment: ScopeAssessment;
  catalog: Catalog;
  /** Capability keys the customer explicitly selected. */
  selectedCapabilities: readonly string[];
  /** "Design it for me" was chosen. */
  wantsDesignService: boolean;
}

/* -------------------------------------------------------------------------
 * Delivery
 * ---------------------------------------------------------------------- */

/**
 * Which delivery product applies.
 *
 * Derived from the guaranteed duration and the build type rather than stored,
 * so a tier whose days are edited in the admin console moves between plans
 * automatically instead of keeping a label that no longer matches its promise.
 */
export function deliveryFor(
  buildType: BuildType,
  tier: ScopeTierId,
  guaranteedDays: number | null,
  externalReview: boolean,
): Delivery {
  if (tier === "custom" || guaranteedDays === null) {
    return {
      plan: "quote",
      guaranteedDays: null,
      // No published duration means no deadline to miss, so no guarantee. A
      // guarantee on an unscoped amount of work is a promise nobody can keep.
      guaranteeApplies: false,
      externalReviewExcluded: externalReview,
    };
  }

  const plan: DeliveryPlan =
    buildType === "mobileApp"
      ? guaranteedDays <= 14
        ? "fourteen_day"
        : "extended"
      : guaranteedDays <= 5
        ? "five_day"
        : "extended";

  return {
    plan,
    guaranteedDays,
    guaranteeApplies: true,
    externalReviewExcluded: externalReview,
  };
}

/* -------------------------------------------------------------------------
 * Explanation
 * ---------------------------------------------------------------------- */

/**
 * What actually pushed the project into its band.
 *
 * Only capabilities whose own floor is at or above the resolved tier count as
 * drivers. "Advanced because it has a contact form" is true and useless; the
 * customer needs the two or three things that genuinely moved it.
 */
export function explain(
  catalog: Catalog,
  assessment: ScopeAssessment,
  tier: ScopeTierId,
): ScopeExplanation {
  const order: ScopeTierId[] = ["essential", "extended", "advanced", "custom"];
  const rank = (value: ScopeTierId) => order.indexOf(value);

  const drivers = assessment.capabilities
    .map((detected) => detected.key)
    .filter((key) => {
      const rule = featureRule(catalog, key);
      return rule ? rank(rule.minimumTier) >= rank(tier) && rank(tier) > 0 : false;
    });

  // Fall back to whatever the assessor itself flagged, so a project that was
  // lifted by accumulated points rather than one hard feature still explains
  // itself rather than showing an empty list.
  const resolved = drivers.length > 0 ? drivers : [...assessment.exceededEntryTierBy];

  const actorReason = assessment.reasons.find(
    (reason) => reason.code === "multiple_user_types",
  );

  return {
    band: BAND_BY_TIER[tier],
    drivers: resolved,
    reasons: assessment.reasons,
    actorGroups: actorReason ? actorReason.capabilityKeys.length : 0,
    complexityPoints: assessment.complexityPoints,
  };
}

/* -------------------------------------------------------------------------
 * Pricing
 * ---------------------------------------------------------------------- */

function taxOn(amount: Money): Money {
  if (!TAX.enabled) return money(0, amount.currency);
  return money(
    Math.round((amount.minorUnits * TAX.rateBasisPoints) / 10_000),
    amount.currency,
  );
}

function priceLine(
  key: string,
  kind: PriceLine["kind"],
  baseMinorUnits: number,
  currency: Currency,
  catalog: Catalog,
): PriceLine {
  const base = money(baseMinorUnits, BASE_CURRENCY);
  const rule = currencyRule(catalog, currency);

  const localized = localizePrice(base, currency, rule);

  return {
    key,
    kind,
    base,
    amount: localized.amount,
    conversion: localized.conversion,
    quantity: 1,
  };
}

/* -------------------------------------------------------------------------
 * The entry point
 * ---------------------------------------------------------------------- */

export function evaluateProject(input: EvaluateInput): ProjectAssessment {
  const {
    assessment,
    catalog,
    currency,
    selectedCapabilities,
    wantsDesignService,
    discountCode,
    now = new Date(),
  } = input;

  const buildType = assessment.buildType;

  // The tier is re-derived from the catalogue rather than taken from the
  // assessor, so an administrator moving a threshold takes effect immediately
  // and in exactly one place.
  const pointsTier = tierForPoints(catalog, buildType, assessment.complexityPoints);
  const floorTier = assessment.tier;

  const order: ScopeTierId[] = ["essential", "extended", "advanced", "custom"];
  const tier =
    order.indexOf(pointsTier) >= order.indexOf(floorTier) ? pointsTier : floorTier;

  const rule = tierRule(catalog, buildType, tier);
  const requiresCustomQuote = tier === "custom" || !rule || rule.priceMinorUnits === null;

  const delivery = deliveryFor(
    buildType,
    tier,
    requiresCustomQuote ? null : (rule?.guaranteedDays ?? null),
    catalog.externalReview[buildType] ?? false,
  );

  const selected = new Set(selectedCapabilities);
  const present = new Set<string>(
    assessment.capabilities.map((detected) => detected.key),
  );

  // Exclusions come from the **catalogue**, not from the shipped constant.
  // Reading `CAPABILITIES` here would tell a customer their build excludes a
  // feature an administrator has since withdrawn, or omit one they added.
  const excluded = catalog.features
    .filter((feature) => feature.isActive && !present.has(feature.key))
    .map((feature) => feature.key) as CapabilityKey[];

  let price: PriceBreakdown | null = null;

  if (!requiresCustomQuote && rule && rule.priceMinorUnits !== null) {
    const lines: PriceLine[] = [
      priceLine(`build.${buildType}`, "build", rule.priceMinorUnits, currency, catalog),
    ];

    if (wantsDesignService && catalog.designFeeMinorUnits > 0) {
      lines.push(
        priceLine(
          "service.design",
          "design_service",
          catalog.designFeeMinorUnits,
          currency,
          catalog,
        ),
      );
    }

    // Per-feature surcharges, for capabilities a business has decided are
    // additive rather than scope-defining. None carry one by default.
    //
    // Sorted, so the line order is a property of the project rather than of
    // the order the browser happened to send its selections in. The totals
    // would be identical either way, but a pricing snapshot that reorders
    // between two identical requests is one nobody can diff.
    for (const key of [...selected].sort()) {
      const feature = featureRule(catalog, key);
      if (!feature?.surchargeMinorUnits) continue;
      lines.push(
        priceLine(
          `feature.${key}`,
          "feature",
          feature.surchargeMinorUnits,
          currency,
          catalog,
        ),
      );
    }

    const subtotal = sumMoney(
      lines.map((line) => line.amount),
      currency,
    );

    const discounted = applyDiscount({
      subtotal,
      discount: catalog.discount,
      code: discountCode ?? null,
      buildType,
      now,
    });

    const taxable = money(subtotal.minorUnits - discounted.amount.minorUnits, currency);
    const tax = taxOn(taxable);

    price = {
      currency,
      lines,
      subtotal,
      discount: discounted.amount,
      appliedDiscount: discounted.applied,
      tax,
      taxNote: TAX.enabled ? null : TAX.noteKey,
      total: money(taxable.minorUnits + tax.minorUnits, currency),
    };
  }

  return {
    engineId: ENGINE_ID,
    engineVersion: ENGINE_VERSION,
    assessorId: assessment.assessorId,
    assessorVersion: assessment.assessorVersion,
    assessedAt: now.toISOString(),
    buildType,
    band: BAND_BY_TIER[tier],
    tier,
    complexityPoints: assessment.complexityPoints,
    capabilities: assessment.capabilities,
    excluded,
    explanation: explain(catalog, assessment, tier),
    delivery,
    price,
    requiresCustomQuote,
    // An extended build still has a published price and a deadline; it is a
    // bigger product, not an absence of one.
    requiresExtendedBuild: delivery.plan === "extended",
  };
}
