/**
 * Scope engine public surface.
 *
 * Callers depend on `assessScope` and the types, never on the rule
 * implementation directly, so swapping in an LLM-backed assessor later is a
 * one-line change here rather than an edit at every call site.
 */
export type {
  Capability,
  DetectedCapability,
  DetectionMethod,
  ScopeAssessment,
  ScopeAssessor,
  ScopeInput,
  TierReason,
} from "./types";

export {
  CAPABILITIES,
  CAPABILITY_CATEGORIES,
  getCapability,
  isCapabilityKey,
} from "./capabilities";
export type { CapabilityKey } from "./capabilities";
export { ENTRY_TIER, TIER_OFFERS, TIER_ORDER, offerFor, tierRank } from "./tiers";
export { RULESET_VERSION, ruleBasedScopeAssessor } from "./rule-assessor";

import { ruleBasedScopeAssessor } from "./rule-assessor";
import type { ScopeAssessment, ScopeAssessor, ScopeInput } from "./types";

/**
 * The assessor currently in use.
 *
 * Rule-based today. When a provider is connected this becomes a selection --
 * read from configuration, with the rule engine as the fallback when the
 * provider is unavailable, so pricing never depends on a third party being up.
 */
const activeAssessor: ScopeAssessor = ruleBasedScopeAssessor;

export function assessScope(input: ScopeInput): Promise<ScopeAssessment> {
  return activeAssessor.assess(input);
}
