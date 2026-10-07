import { DELIVERY_DAYS } from "./brand";
import { fromMajorUnits, type Money } from "@/lib/pricing/money";

/**
 * The orderable build types.
 *
 * This is the commercial catalogue, not display copy: names and descriptions
 * live in the translation catalogues and are looked up by `id`. The scope
 * engine and the configurator both read from here, so a price or a guaranteed
 * duration is defined exactly once.
 */

export const BUILD_TYPES = ["website", "system", "mobileApp"] as const;
export type BuildType = (typeof BUILD_TYPES)[number];

export interface BuildProduct {
  id: BuildType;
  /** Base price for the smallest qualifying scope, in the base currency. */
  basePrice: Money;
  /**
   * Whether the base price is the final price or a floor.
   *
   * `fixed`  the published price is the price for a qualifying scope.
   * `from`   scope drives the final figure upward from this floor.
   *
   * This distinction is the honest half of the fixed-price promise, and it is
   * modelled in data so the UI cannot accidentally present a floor as a cap.
   */
  priceModel: "fixed" | "from";
  /** Guaranteed development days, counted from the official build start. */
  guaranteedDays: number;
  /**
   * True when third-party review time sits outside the guarantee -- app store
   * review, which is outside our control and must be disclosed as such.
   */
  hasExternalReviewStep: boolean;
  /**
   * True when the customer picks more than one delivery target.
   *
   * Declared rather than inferred from the id. It was `buildType ===
   * "mobileApp"`, which is only true by coincidence: a future product that
   * ships to several targets would have had to edit that predicate, and one
   * that does not would have been caught by it.
   */
  allowsMultiplePlatforms: boolean;
}

export const BUILD_PRODUCTS: Record<BuildType, BuildProduct> = {
  website: {
    id: "website",
    basePrice: fromMajorUnits(400),
    priceModel: "fixed",
    guaranteedDays: DELIVERY_DAYS.website,
    hasExternalReviewStep: false,
    allowsMultiplePlatforms: false,
  },
  system: {
    id: "system",
    basePrice: fromMajorUnits(400),
    priceModel: "from",
    guaranteedDays: DELIVERY_DAYS.system,
    hasExternalReviewStep: false,
    allowsMultiplePlatforms: false,
  },
  mobileApp: {
    id: "mobileApp",
    basePrice: fromMajorUnits(600),
    priceModel: "fixed",
    guaranteedDays: DELIVERY_DAYS.mobileApp,
    hasExternalReviewStep: true,
    allowsMultiplePlatforms: true,
  },
};

/**
 * Narrows an untrusted or stored value to a build type.
 *
 * Needed because a build type arrives from places TypeScript cannot vouch for:
 * a `jsonb` scope snapshot, a query string, a column typed `text`. Without a
 * guard those become `string` and every lookup against a product map is an
 * implicit `any`, which is how a retired product id ends up indexing into
 * nothing at runtime.
 */
export function isBuildType(value: unknown): value is BuildType {
  return typeof value === "string" && (BUILD_TYPES as readonly string[]).includes(value);
}

/** The product for a build type, or null when the value is not one. */
export function buildProduct(value: unknown): BuildProduct | null {
  return isBuildType(value) ? BUILD_PRODUCTS[value] : null;
}

/** Ordered for display: cheapest and fastest first. */
export const BUILD_PRODUCT_LIST: readonly BuildProduct[] = BUILD_TYPES.map(
  (type) => BUILD_PRODUCTS[type],
);
