import type { BuildType } from "@/config/products";
import type { ScopeTierId } from "@/db/schema/enums";
import type { Locale } from "@/config/locales";
import type { Money } from "@/lib/pricing/money";

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
  key: string;
  method: DetectionMethod;
  /**
   * The phrase that matched, for `text_match`. Surfaced to the customer so the
   * assessment can be argued with rather than merely accepted.
   */
  evidence?: string;
  /** For `implied`, the capability that required this one. */
  impliedBy?: string;
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
}

/** A plain-language reason the project landed above the entry tier. */
export interface TierReason {
  /** Translation key suffix under `scope.reasons`. */
  code: string;
  /** Capability keys that triggered this reason. */
  capabilityKeys: readonly string[];
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
  price: Money | null;
  guaranteedDays: number | null;
  /** When the entry tier was exceeded, the capabilities responsible. */
  exceededEntryTierBy: readonly string[];
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
