import { CURRENCY_PRESENTATION, RATES_REVIEWED_ON } from "@/config/currency";
import { DESIGN_SERVICE } from "@/config/design";
import { BUILD_PRODUCTS, BUILD_TYPES, type BuildType } from "@/config/products";
import type { ScopeTierId } from "@/db/schema/enums";
import { CAPABILITIES, TIER_OFFERS, type Capability } from "@/lib/scope";
import { TIER_POINT_THRESHOLDS } from "@/lib/scope/tiers";
import { SUPPORTED_CURRENCIES, type Currency } from "@/lib/pricing/money";

/**
 * The catalogue the engine evaluates against.
 *
 * A plain value, not a service. The engine is pure and takes this as an
 * argument, which is what lets the same arithmetic be driven by the shipped
 * defaults in a unit test and by the database in production without the
 * calculation knowing which.
 *
 * `defaultCatalog()` builds it from the `config/` constants. The server
 * overlays any rows an administrator has edited; an empty table means "use
 * what shipped", so the platform prices correctly before anyone has opened the
 * admin screens.
 */

export interface FeatureRule {
  key: string;
  categoryId: string;
  points: number;
  minimumTier: ScopeTierId;
  implies: readonly string[];
  appliesTo: readonly string[];
  /** Charged on top of the tier price. Null when the tier already covers it. */
  surchargeMinorUnits: number | null;
  isActive: boolean;
}

export interface TierRule {
  buildType: BuildType;
  tier: ScopeTierId;
  priceMinorUnits: number | null;
  guaranteedDays: number | null;
  pointThreshold: number;
  isActive: boolean;
}

export interface CurrencyRule {
  code: Currency;
  rate: number;
  roundToMinorUnits: number;
  isActive: boolean;
  reviewedOn: string;
}

export interface DiscountRule {
  code: string;
  description: string | null;
  kind: "percentage" | "fixed";
  value: number;
  maxDiscountMinorUnits: number | null;
  minOrderMinorUnits: number | null;
  appliesToBuildTypes: readonly string[];
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  timesUsed: number;
  isActive: boolean;
}

export interface Catalog {
  features: readonly FeatureRule[];
  tiers: readonly TierRule[];
  currencies: readonly CurrencyRule[];
  /** Only the one code the customer supplied is ever loaded. */
  discount: DiscountRule | null;
  designFeeMinorUnits: number;
  /** Which builds have an external review step outside the guarantee. */
  externalReview: Record<BuildType, boolean>;
}

/** The catalogue exactly as shipped, before any administrator edits it. */
export function defaultCatalog(): Catalog {
  // `CAPABILITIES` is `as const satisfies`, so each entry has only the keys it
  // literally declares -- `implies` and `appliesTo` are absent on most of them
  // rather than undefined. Widening to the interface is what makes them
  // uniformly readable.
  const features: FeatureRule[] = (CAPABILITIES as readonly Capability[]).map(
    (capability) => ({
      key: capability.key,
      categoryId: capability.categoryId,
      points: capability.points,
      minimumTier: capability.minimumTier,
      implies: capability.implies ?? [],
      appliesTo: capability.appliesTo ?? [],
      // Nothing carries a surcharge by default: the tier price is the price, and
      // per-feature add-ons are a deliberate commercial choice to switch on.
      surchargeMinorUnits: null,
      isActive: true,
    }),
  );

  const tiers: TierRule[] = BUILD_TYPES.flatMap((buildType) =>
    (Object.keys(TIER_OFFERS[buildType]) as ScopeTierId[]).map((tier) => {
      const offer = TIER_OFFERS[buildType][tier];
      return {
        buildType,
        tier,
        priceMinorUnits: offer.price?.minorUnits ?? null,
        guaranteedDays: offer.guaranteedDays,
        pointThreshold: TIER_POINT_THRESHOLDS[tier],
        isActive: true,
      };
    }),
  );

  const currencies: CurrencyRule[] = SUPPORTED_CURRENCIES.map((code) => ({
    code,
    rate: CURRENCY_PRESENTATION[code].rate,
    roundToMinorUnits: CURRENCY_PRESENTATION[code].roundToMinorUnits,
    isActive: true,
    reviewedOn: RATES_REVIEWED_ON,
  }));

  return {
    features,
    tiers,
    currencies,
    discount: null,
    designFeeMinorUnits: DESIGN_SERVICE.fee.minorUnits,
    externalReview: Object.fromEntries(
      BUILD_TYPES.map((type) => [type, BUILD_PRODUCTS[type].hasExternalReviewStep]),
    ) as Record<BuildType, boolean>,
  };
}

/* -------------------------------------------------------------------------
 * Lookups
 * ---------------------------------------------------------------------- */

export function featureRule(catalog: Catalog, key: string): FeatureRule | undefined {
  return catalog.features.find((feature) => feature.key === key && feature.isActive);
}

export function tierRule(
  catalog: Catalog,
  buildType: BuildType,
  tier: ScopeTierId,
): TierRule | undefined {
  return catalog.tiers.find(
    (rule) => rule.buildType === buildType && rule.tier === tier && rule.isActive,
  );
}

export function currencyRule(catalog: Catalog, code: Currency): CurrencyRule | undefined {
  return catalog.currencies.find((rule) => rule.code === code && rule.isActive);
}

/**
 * The tier a point total selects.
 *
 * Thresholds come from the catalogue rather than from a constant, so moving
 * one is a commercial decision an administrator can make -- which is the lever
 * a business pulls when its estimates turn out to be wrong.
 *
 * A withdrawn tier resolves **upward**, never down. Filtering inactive rows
 * out before walking the ladder looks equivalent and is not: it would make a
 * twelve-point brief whose band has been withdrawn fall through to the entry
 * price, selling moderate work for the cost of a simple site. Work that
 * outgrew a tier has to land above it or be quoted.
 */
export function tierForPoints(
  catalog: Catalog,
  buildType: BuildType,
  points: number,
): ScopeTierId {
  const ladder = catalog.tiers
    .filter((rule) => rule.buildType === buildType)
    .sort((a, b) => a.pointThreshold - b.pointThreshold);

  if (ladder.length === 0) return "essential";

  // The band the points fall in, withdrawn or not.
  let index = 0;
  for (let position = 0; position < ladder.length; position += 1) {
    if (points >= ladder[position]!.pointThreshold) index = position;
  }

  // Climb to the first tier that is actually sold.
  for (let position = index; position < ladder.length; position += 1) {
    const rule = ladder[position]!;
    if (rule.isActive) return rule.tier;
  }

  // Everything at or above the band is withdrawn, so there is nothing to sell
  // this at. A quotation is the honest answer.
  return "custom";
}
