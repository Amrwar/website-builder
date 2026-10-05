import type { BuildType } from "@/config/products";
import type { ScopeTierId } from "@/db/schema/enums";

import { getCapability } from "./capabilities";
import { detectCapabilities } from "./detection";
import {
  ENTRY_TIER,
  maxTier,
  offerFor,
  requiresCustomQuote,
  tierForPoints,
  tierRank,
} from "./tiers";
import type {
  DetectedCapability,
  ScopeAssessment,
  ScopeAssessor,
  ScopeInput,
  TierReason,
} from "./types";

/**
 * Deterministic, rule-based scope assessment.
 *
 * This is real logic, not a stand-in for intelligence it does not have: every
 * output is derived from the published capability registry and tier ladder,
 * and every conclusion carries the evidence that produced it. An LLM-backed
 * assessor can replace this behind the same `ScopeAssessor` interface without
 * anything downstream changing.
 */

/**
 * Ruleset version, stored on every assessment.
 *
 * Bump this whenever capability points, tier thresholds or patterns change,
 * so past decisions remain attributable to the rules that produced them.
 */
export const RULESET_VERSION = "2026.10.1";

/** Screens included before volume starts adding complexity. */
const SCREEN_ALLOWANCE: Record<BuildType, number> = {
  website: 6,
  system: 8,
  mobileApp: 8,
};

/** Points added per screen beyond the allowance. */
const POINTS_PER_EXTRA_SCREEN = 1;

/** Ceiling on screen-derived points, so page count alone cannot force a quote. */
const MAX_SCREEN_POINTS = 12;

/** Category to plain-language reason code, resolved in the translations. */
const CATEGORY_REASON: Record<string, string> = {
  identity: "multiple_user_types",
  realtime: "realtime_features",
  operations: "operational_logic",
  commerce: "commerce_complexity",
  integration: "integration_work",
  platform: "native_platform",
  content: "content_scope",
};

function screenPoints(buildType: BuildType, estimatedScreens: number | undefined): number {
  if (!estimatedScreens) return 0;
  const excess = estimatedScreens - SCREEN_ALLOWANCE[buildType];
  if (excess <= 0) return 0;
  return Math.min(excess * POINTS_PER_EXTRA_SCREEN, MAX_SCREEN_POINTS);
}

/** Groups the capabilities that raised the tier into readable reasons. */
function buildReasons(
  raisers: readonly DetectedCapability[],
  pointsDroveTier: boolean,
): TierReason[] {
  const byReason = new Map<string, string[]>();

  for (const detected of raisers) {
    const capability = getCapability(detected.key);
    if (!capability) continue;
    const code = CATEGORY_REASON[capability.categoryId] ?? "additional_scope";
    const keys = byReason.get(code) ?? [];
    keys.push(detected.key);
    byReason.set(code, keys);
  }

  const reasons: TierReason[] = [...byReason.entries()].map(([code, capabilityKeys]) => ({
    code,
    capabilityKeys,
  }));

  // Distinguish "one hard feature" from "a lot of ordinary work", because the
  // two warrant genuinely different conversations with the customer.
  if (pointsDroveTier) {
    reasons.push({ code: "accumulated_complexity", capabilityKeys: [] });
  }

  return reasons;
}

export class RuleBasedScopeAssessor implements ScopeAssessor {
  readonly id = "rule-engine";
  readonly version = RULESET_VERSION;

  // Async to satisfy the interface, which exists so a network-backed assessor
  // can be substituted. This implementation never awaits anything.
  async assess(input: ScopeInput): Promise<ScopeAssessment> {
    const capabilities = detectCapabilities(input);

    const capabilityPoints = capabilities.reduce(
      (total, detected) => total + (getCapability(detected.key)?.points ?? 0),
      0,
    );
    const complexityPoints =
      capabilityPoints + screenPoints(input.buildType, input.estimatedScreens);

    // Two independent routes up the ladder: accumulated points, and any single
    // capability's floor. The higher of the two wins.
    const pointsTier = tierForPoints(complexityPoints);

    let floorTier: ScopeTierId = ENTRY_TIER;
    for (const detected of capabilities) {
      const capability = getCapability(detected.key);
      if (capability) floorTier = maxTier(floorTier, capability.minimumTier);
    }

    const tier = maxTier(pointsTier, floorTier);

    const raisers = capabilities.filter((detected) => {
      const capability = getCapability(detected.key);
      return capability ? tierRank(capability.minimumTier) > tierRank(ENTRY_TIER) : false;
    });

    const pointsDroveTier =
      tierRank(pointsTier) > tierRank(ENTRY_TIER) && tierRank(pointsTier) >= tierRank(floorTier);

    const offer = offerFor(input.buildType, tier);

    return {
      assessorId: this.id,
      assessorVersion: this.version,
      buildType: input.buildType,
      tier,
      complexityPoints,
      capabilities,
      reasons:
        tierRank(tier) > tierRank(ENTRY_TIER) ? buildReasons(raisers, pointsDroveTier) : [],
      requiresCustomQuote: requiresCustomQuote(tier),
      price: offer.price,
      guaranteedDays: offer.guaranteedDays,
      exceededEntryTierBy: raisers.map((detected) => detected.key),
    };
  }
}

/** Shared instance; the assessor is stateless. */
export const ruleBasedScopeAssessor = new RuleBasedScopeAssessor();
