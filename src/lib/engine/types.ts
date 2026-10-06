import type { BuildType } from "@/config/products";
import type { ScopeTierId } from "@/db/schema/enums";
import type { Currency, Money } from "@/lib/pricing/money";
import type { ConversionRecord } from "@/lib/pricing/localize";
import type { CapabilityKey, DetectedCapability, TierReason } from "@/lib/scope";

/**
 * The scope and pricing engine's contracts.
 *
 * One answer, for every surface. The configurator, checkout, the Build Room,
 * the admin console and every product type that arrives later all read the
 * same `ProjectAssessment` -- which is the point of having an engine rather
 * than a set of helpers that each caller assembles differently.
 */

/* -------------------------------------------------------------------------
 * Scope
 * ---------------------------------------------------------------------- */

/**
 * The customer-facing scope band.
 *
 * Distinct from `ScopeTierId`, which is the *commercial* ladder that selects a
 * price and a duration. A band is the word a person uses; a tier is the row in
 * the price list. They map one to one today, and keeping them separate means a
 * future "advanced" tier split into two price points does not force a new
 * vocabulary on customers.
 */
export const SCOPE_BANDS = ["simple", "moderate", "advanced", "custom"] as const;
export type ScopeBand = (typeof SCOPE_BANDS)[number];

export const BAND_BY_TIER: Record<ScopeTierId, ScopeBand> = {
  essential: "simple",
  extended: "moderate",
  advanced: "advanced",
  custom: "custom",
};

/* -------------------------------------------------------------------------
 * Delivery
 * ---------------------------------------------------------------------- */

/**
 * How the work will be delivered.
 *
 * `five_day` and `fourteen_day` are the guaranteed products. `extended` is a
 * longer build that still carries a published price and deadline. `quote` has
 * neither, and therefore no guarantee -- which is the whole reason the four
 * are modelled separately rather than as a number of days.
 */
export const DELIVERY_PLANS = ["five_day", "fourteen_day", "extended", "quote"] as const;
export type DeliveryPlan = (typeof DELIVERY_PLANS)[number];

export interface Delivery {
  plan: DeliveryPlan;
  /** Working days of development. Null for a quotation. */
  guaranteedDays: number | null;
  /**
   * Whether the delivery guarantee applies. False for a quotation, and for
   * anything the engine could not price -- a guarantee on an unknown amount of
   * work is a promise nobody can keep.
   */
  guaranteeApplies: boolean;
  /** True when a third party reviews the result outside our deadline. */
  externalReviewExcluded: boolean;
}

/* -------------------------------------------------------------------------
 * Pricing
 * ---------------------------------------------------------------------- */

export interface PriceLine {
  /** Stable key, e.g. "build.website", "service.design", "feature.public_api". */
  key: string;
  kind: "build" | "design_service" | "feature" | "integration" | "time";
  /** Base-currency amount before conversion. */
  base: Money;
  /** Charged amount in the customer's currency. */
  amount: Money;
  conversion: ConversionRecord;
  quantity: number;
}

export interface AppliedDiscount {
  code: string;
  kind: "percentage" | "fixed";
  /** The reduction, in the charge currency. */
  amount: Money;
  description: string | null;
}

export interface PriceBreakdown {
  currency: Currency;
  lines: readonly PriceLine[];
  subtotal: Money;
  discount: Money;
  appliedDiscount: AppliedDiscount | null;
  tax: Money;
  taxNote: string | null;
  total: Money;
}

/* -------------------------------------------------------------------------
 * Explanation
 * ---------------------------------------------------------------------- */

/**
 * Why the project landed where it did, in a form that can be rendered as a
 * sentence or as a list.
 *
 * `drivers` are the capabilities that actually moved the band, not every
 * capability present -- "advanced because it has a contact form" is true and
 * useless.
 */
export interface ScopeExplanation {
  band: ScopeBand;
  drivers: readonly CapabilityKey[];
  reasons: readonly TierReason[];
  /** Distinct groups of people who use the thing being built. */
  actorGroups: number;
  complexityPoints: number;
}

/* -------------------------------------------------------------------------
 * The result
 * ---------------------------------------------------------------------- */

export interface ProjectAssessment {
  /** Identifies the engine and ruleset that produced this. */
  engineId: string;
  engineVersion: string;
  /**
   * The assessor that read the brief, as distinct from the engine that priced
   * it. Both are recorded because they can be changed independently, and an
   * order months old has to say which pair produced its figure.
   */
  assessorId: string;
  assessorVersion: string;
  assessedAt: string;

  buildType: BuildType;
  band: ScopeBand;
  tier: ScopeTierId;
  complexityPoints: number;

  capabilities: readonly DetectedCapability[];
  /** Capabilities NOT included, so exclusions can be stated as plainly as inclusions. */
  excluded: readonly CapabilityKey[];

  explanation: ScopeExplanation;
  delivery: Delivery;

  /** Null when the work requires a quotation. */
  price: PriceBreakdown | null;
  requiresCustomQuote: boolean;
  requiresExtendedBuild: boolean;
}

/** Everything the engine needs that is not the brief itself. */
export interface EngineInputs {
  currency: Currency;
  /** Normalised upper-case coupon code, if the customer supplied one. */
  discountCode?: string | null;
  /** Fixed clock, so an assessment is reproducible in a test. */
  now?: Date;
}
