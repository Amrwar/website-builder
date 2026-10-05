import type { BuildType } from "@/config/products";
import { SCOPE_TIERS, type ScopeTierId } from "@/db/schema/enums";
import { fromMajorUnits, type Money } from "@/lib/pricing/money";

/**
 * The scope ladder.
 *
 * A project resolves to exactly one tier. `custom` is terminal: it has no
 * published price because the work cannot be honestly fixed-priced, and the
 * customer is routed to a quotation instead of being quietly underquoted.
 */

/** Ladder order, smallest first. Index is the comparison key. */
export const TIER_ORDER: readonly ScopeTierId[] = SCOPE_TIERS;

export function tierRank(tier: ScopeTierId): number {
  return TIER_ORDER.indexOf(tier);
}

/** Returns whichever tier is higher up the ladder. */
export function maxTier(a: ScopeTierId, b: ScopeTierId): ScopeTierId {
  return tierRank(a) >= tierRank(b) ? a : b;
}

export const ENTRY_TIER: ScopeTierId = "essential";

/**
 * Complexity thresholds.
 *
 * The lower bound of each tier. A brief's accumulated points select a tier
 * here, which is then raised by any capability's `minimumTier` floor.
 */
export const TIER_POINT_THRESHOLDS: Record<ScopeTierId, number> = {
  essential: 0,
  extended: 10,
  advanced: 25,
  custom: 45,
};

export function tierForPoints(points: number): ScopeTierId {
  let resolved: ScopeTierId = "essential";
  for (const tier of TIER_ORDER) {
    if (points >= TIER_POINT_THRESHOLDS[tier]) resolved = tier;
  }
  return resolved;
}

export interface TierOffer {
  price: Money | null;
  /** Guaranteed development days. Null when a quotation is required. */
  guaranteedDays: number | null;
}

/**
 * Published price and duration per build type and tier.
 *
 * ────────────────────────────────────────────────────────────────────────
 * COMMERCIAL NOTE: only the `essential` row of each build type comes from
 * the stated offer (website 400 CAD / 5 days, system from 400 CAD / 5 days,
 * mobile app 600 CAD / 14 days). The `extended` and `advanced` figures are
 * provisional placeholders chosen to be internally consistent, and they need
 * commercial sign-off before the configurator is exposed to customers.
 * They are isolated here so that approving them is a single edit.
 * ────────────────────────────────────────────────────────────────────────
 */
export const TIER_OFFERS: Record<BuildType, Record<ScopeTierId, TierOffer>> = {
  website: {
    essential: { price: fromMajorUnits(400), guaranteedDays: 5 },
    extended: { price: fromMajorUnits(900), guaranteedDays: 10 },
    advanced: { price: fromMajorUnits(1800), guaranteedDays: 15 },
    custom: { price: null, guaranteedDays: null },
  },
  system: {
    essential: { price: fromMajorUnits(400), guaranteedDays: 5 },
    extended: { price: fromMajorUnits(1200), guaranteedDays: 12 },
    advanced: { price: fromMajorUnits(2400), guaranteedDays: 20 },
    custom: { price: null, guaranteedDays: null },
  },
  mobileApp: {
    essential: { price: fromMajorUnits(600), guaranteedDays: 14 },
    extended: { price: fromMajorUnits(1500), guaranteedDays: 21 },
    advanced: { price: fromMajorUnits(3000), guaranteedDays: 30 },
    custom: { price: null, guaranteedDays: null },
  },
};

export function offerFor(buildType: BuildType, tier: ScopeTierId): TierOffer {
  return TIER_OFFERS[buildType][tier];
}

export function requiresCustomQuote(tier: ScopeTierId): boolean {
  return tier === "custom";
}
