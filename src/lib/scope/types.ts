import type { DesignApproach } from "@/db/schema/enums";
import type { PlatformId } from "@/config/platforms";
import type { BuildType } from "@/config/products";
import type { ScopeTierId } from "@/db/schema/enums";
import type { Locale } from "@/config/locales";
import type { Money } from "@/lib/pricing/money";
import type { CapabilityKey } from "./capabilities";

/**
 * Scope engine contracts.
 *
 * These types are the boundary between *how* scope is determined and *what*
 * the rest of the platform does with the answer. The current implementation is
 * a deterministic rule engine; an LLM-backed implementation can satisfy the
 * same `ScopeAssessor` interface without anything downstream changing.
 */

/** Why a capability was considered present. */
export type DetectionMethod =
  /** The customer explicitly selected it in the configurator. Authoritative. */
  | "selected"
  /** Matched against the free-text brief. A signal, not a declaration. */
  | "text_match"
  /** Implied by another capability that requires it. */
  | "implied"
  /** Added by a human reviewing the project. */
  | "manual";

export interface CapabilityCategory {
  id: string;
  /** Translation key suffix under `scope.categories`. */
  labelKey: string;
}

export interface Capability {
  key: string;
  categoryId: string;
  /**
   * Relative build effort. Points accumulate and push a project up the tier
   * ladder once thresholds are crossed.
   */
  points: number;
  /**
   * The smallest tier that may contain this capability, regardless of points.
   *
   * This is what stops a single genuinely-hard feature from hiding inside an
   * otherwise simple project: live driver tracking is not a 5-day build no
   * matter how little else is asked for.
   */
  minimumTier: ScopeTierId;
  /** Capabilities this one necessarily drags in. */
  implies?: readonly string[];
  /** Build types this capability is meaningful for. Absent means all. */
  appliesTo?: readonly BuildType[];
}

/** A capability found in a brief, with the evidence for it. */
export interface DetectedCapability {
  key: CapabilityKey;
  method: DetectionMethod;
  /**
   * The phrase that matched, for `text_match`. Surfaced to the customer so the
   * assessment can be argued with rather than merely accepted.
   */
  evidence?: string;
  /** For `implied`, the capability that required this one. */
  impliedBy?: CapabilityKey;
}

export interface ScopeInput {
  buildType: BuildType;
  /** The customer's own description. May be empty. */
  ideaText: string;
  /** Language the description is written in, so the right patterns apply. */
  locale: Locale;
  /** Capability keys explicitly chosen in the configurator. */
  selectedCapabilities: readonly string[];
  /** Declared page or screen count, when given. */
  estimatedScreens?: number;
  /** Delivery platforms. Native targets add build effort. */
  platforms?: readonly PlatformId[];
  /** Chosen design route; "design_for_me" carries a separate fee. */
  designApproach?: DesignApproach;
  /**
   * Supporting context from the intake step.
   *
   * Scanned for capability signals alongside the main description: an
   * industry of "restaurant delivery" or a target customer of "our drivers"
   * carries as much meaning as the free-text paragraph, and ignoring it
   * under-scopes the project.
   */
  context?: {
    businessName?: string;
    industry?: string;
    targetCustomers?: string;
    desiredOutcome?: string;
  };
}

/**
 * Headline complexity band, for the configurator's indicator.
 *
 * Derived from accumulated points rather than from the tier, so it stays
 * meaningful when a single hard capability forces a tier jump that the raw
 * amount of work does not justify.
 */
export type ComplexityBand = "simple" | "moderate" | "advanced";

/**
 * Reason codes, matching the keys under `scopeReasons.*` in the catalogues.
 * A union rather than a string so a new reason cannot ship without its copy.
 */
export type ScopeReasonCode =
  | "multiple_user_types"
  | "realtime_features"
  | "operational_logic"
  | "commerce_complexity"
  | "integration_work"
  | "native_platform"
  | "content_scope"
  | "additional_scope"
  | "accumulated_complexity";

/** A plain-language reason the project landed above the entry tier. */
export interface TierReason {
  code: ScopeReasonCode;
  /** Capability keys that triggered this reason. */
  capabilityKeys: readonly CapabilityKey[];
}

export interface ScopeAssessment {
  /** Identifies the implementation that produced this, e.g. "rule-engine". */
  assessorId: string;
  /**
   * Ruleset version. Stored with every assessment so a past decision can be
   * reproduced exactly even after the rules change.
   */
  assessorVersion: string;
  buildType: BuildType;
  tier: ScopeTierId;
  complexityPoints: number;
  capabilities: readonly DetectedCapability[];
  reasons: readonly TierReason[];
  /**
   * True when the work cannot be sold at a published price. `price` and
   * `guaranteedDays` are then null and a human quotation is owed.
   */
  requiresCustomQuote: boolean;
  /** Build price before the optional design service. */
  price: Money | null;
  /** Design service fee when "design it for me" is chosen, else null. */
  designFee: Money | null;
  /** price + designFee. Null whenever a custom quotation is required. */
  totalPrice: Money | null;
  complexity: ComplexityBand;
  guaranteedDays: number | null;
  /** When the entry tier was exceeded, the capabilities responsible. */
  exceededEntryTierBy: readonly CapabilityKey[];
}

/**
 * The seam an AI provider plugs into later.
 *
 * Implementations must be deterministic in their *output shape* and must
 * always populate `capabilities` with real evidence -- an assessment the
 * customer cannot interrogate is not acceptable, whatever produced it.
 */
export interface ScopeAssessor {
  readonly id: string;
  readonly version: string;
  assess(input: ScopeInput): Promise<ScopeAssessment>;
}
