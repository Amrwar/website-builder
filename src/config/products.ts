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
}

export const BUILD_PRODUCTS: Record<BuildType, BuildProduct> = {
  website: {
    id: "website",
    basePrice: fromMajorUnits(400),
    priceModel: "fixed",
    guaranteedDays: DELIVERY_DAYS.website,
    hasExternalReviewStep: false,
  },
  system: {
    id: "system",
    basePrice: fromMajorUnits(400),
    priceModel: "from",
    guaranteedDays: DELIVERY_DAYS.system,
    hasExternalReviewStep: false,
  },
  mobileApp: {
    id: "mobileApp",
    basePrice: fromMajorUnits(600),
    priceModel: "fixed",
    guaranteedDays: DELIVERY_DAYS.mobileApp,
    hasExternalReviewStep: true,
  },
};

/** Ordered for display: cheapest and fastest first. */
export const BUILD_PRODUCT_LIST: readonly BuildProduct[] = BUILD_TYPES.map(
  (type) => BUILD_PRODUCTS[type],
);
