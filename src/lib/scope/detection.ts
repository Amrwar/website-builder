import { detectActors, MULTI_ROLE_THRESHOLD } from "./actors";
import { capabilitiesFor, getCapability, isCapabilityKey } from "./capabilities";
import { firstMatch, normalize } from "./normalize";
import { fallbackPatterns, patternsFor } from "./patterns";
import type { CapabilityKey } from "./capabilities";
import type { DetectedCapability, DetectionMethod, ScopeInput } from "./types";

/**
 * Capability detection.
 *
 * Three sources, in descending order of authority:
 *
 *   1. configurator selections -- an explicit statement of intent
 *   2. actor analysis          -- distinct kinds of person described
 *   3. free-text phrase match  -- a signal, always reported with its evidence
 *
 * Implications are then resolved: a capability that cannot exist without
 * another drags it in, marked `implied` so it is clear it was never asked for
 * directly.
 */

/** Authority order used when the same capability is found more than once. */
const METHOD_PRIORITY: Record<DetectionMethod, number> = {
  manual: 3,
  selected: 2,
  text_match: 1,
  implied: 0,
};

function upsert(into: Map<string, DetectedCapability>, candidate: DetectedCapability) {
  const existing = into.get(candidate.key);
  if (!existing || METHOD_PRIORITY[candidate.method] > METHOD_PRIORITY[existing.method]) {
    into.set(candidate.key, candidate);
  }
}

export function detectCapabilities(input: ScopeInput): DetectedCapability[] {
  const found = new Map<string, DetectedCapability>();

  // Only capabilities meaningful for this build type are considered, so a
  // website brief cannot acquire mobile-only capabilities.
  // Widened deliberately: membership is tested against untyped input.
  const allowed = new Set<string>(capabilitiesFor(input.buildType).map((c) => c.key));

  // --- 1. Explicit selections -------------------------------------------
  for (const key of input.selectedCapabilities) {
    if (!isCapabilityKey(key) || !allowed.has(key)) continue;
    upsert(found, { key, method: "selected" });
  }

  // The intake fields carry capability signals just as the paragraph does:
  // an industry of "food delivery" or a target customer of "our drivers" is
  // evidence. Joined with a separator so a phrase cannot match across the
  // boundary between two unrelated answers.
  const haystack = normalize(
    [
      input.ideaText,
      input.context?.industry,
      input.context?.targetCustomers,
      input.context?.desiredOutcome,
    ]
      .filter(Boolean)
      .join(" . "),
  );

  if (haystack) {
    // --- 2. Actor analysis ----------------------------------------------
    const actors = detectActors(haystack, input.locale);
    if (
      actors.groupIds.length >= MULTI_ROLE_THRESHOLD &&
      allowed.has("multi_role_access")
    ) {
      upsert(found, {
        key: "multi_role_access",
        method: "text_match",
        evidence: actors.evidence.join(", "),
      });
    }

    // --- 3. Phrase matching ---------------------------------------------
    // The brief's own language first, then English, since briefs routinely mix
    // English technical vocabulary into another language.
    const sets = [patternsFor(input.locale), fallbackPatterns()];
    for (const set of sets) {
      // `PatternSet` is keyed by CapabilityKey; `Object.entries` erases that.
      for (const [key, phrases] of Object.entries(set) as [
        CapabilityKey,
        readonly string[] | undefined,
      ][]) {
        if (!phrases || !allowed.has(key) || found.has(key)) continue;
        const evidence = firstMatch(haystack, phrases);
        if (evidence) upsert(found, { key, method: "text_match", evidence });
      }
    }
  }

  resolveImplications(found, allowed);

  return [...found.values()];
}

/**
 * Pulls in capabilities that the detected ones necessarily require.
 *
 * Iterates to a fixed point because an implication can itself imply something
 * further: marketplace payouts require multiple roles, and live tracking
 * requires live updates.
 */
function resolveImplications(
  found: Map<string, DetectedCapability>,
  allowed: ReadonlySet<string>,
) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const detected of [...found.values()]) {
      const capability = getCapability(detected.key);
      if (!capability?.implies) continue;

      for (const impliedKey of capability.implies as readonly CapabilityKey[]) {
        if (found.has(impliedKey) || !allowed.has(impliedKey)) continue;
        found.set(impliedKey, {
          key: impliedKey,
          method: "implied",
          impliedBy: detected.key,
        });
        changed = true;
      }
    }
  }
}
