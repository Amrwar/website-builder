import { fromMajorUnits, type Money } from "@/lib/pricing/money";

/**
 * Maintenance plans.
 *
 * A build is bought once; keeping it running is a separate, cancellable
 * subscription. Folding hosting into the headline price would make the
 * published figure untrue from the second month, which is the opposite of
 * what the fixed-price promise is for.
 *
 * ────────────────────────────────────────────────────────────────────────
 * COMMERCIAL NOTE: these monthly prices are provisional. The brief fixed the
 * build prices (400 / 400 / 600 CAD) but said nothing about maintenance, so
 * the figures below are placeholders chosen to be internally consistent and
 * need commercial sign-off before launch. They are isolated here so that
 * approving them is a single edit.
 * ────────────────────────────────────────────────────────────────────────
 */

export const MAINTENANCE_PLAN_IDS = ["essential", "standard", "priority"] as const;
export type MaintenancePlanId = (typeof MAINTENANCE_PLAN_IDS)[number];

export interface MaintenancePlan {
  id: MaintenancePlanId;
  /** Billed monthly, in the base currency. */
  price: Money;
  /** Keys under `home.maintenance.features.*`. */
  featureKeys: readonly string[];
  /**
   * Promotes one plan visually. Declared on every plan rather than left
   * optional, so reading it never has to narrow a union first.
   */
  recommended: boolean;
}

/**
 * `satisfies` rather than a type annotation: an annotation would widen
 * `featureKeys` to `string[]` and lose the literal keys that make the
 * translation lookup checkable against the catalogue.
 */
export const MAINTENANCE_PLANS = [
  {
    id: "essential",
    price: fromMajorUnits(29),
    featureKeys: ["hosting", "ssl", "backups", "uptime"],
    recommended: false,
  },
  {
    id: "standard",
    price: fromMajorUnits(79),
    featureKeys: ["everythingEssential", "contentEdits", "monitoring", "support"],
    recommended: true,
  },
  {
    id: "priority",
    price: fromMajorUnits(199),
    featureKeys: ["everythingStandard", "buildCredits", "priorityQueue", "reporting"],
    recommended: false,
  },
] as const satisfies readonly MaintenancePlan[];
