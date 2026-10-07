import { z } from "zod";

import { LOCALES } from "@/config/locales";
import { PLATFORM_IDS, defaultPlatformsFor, platformConflict } from "@/config/platforms";
import { BLUEPRINT_KEY_PATTERN, FEATURE_IDS, GOAL_IDS } from "@/config/business";
import { BUILD_TYPES, type BuildType } from "@/config/products";
import { DESIGN_APPROACHES } from "@/db/schema/enums";
import { CAPABILITIES } from "@/lib/scope";
import type { CapabilityKey } from "@/lib/scope";

/**
 * Configurator draft.
 *
 * One schema describing the whole configuration, with per-step validation
 * derived from it. The client uses it to decide whether "Next" is enabled;
 * the server re-parses the same schema before assessing, because the scope
 * engine decides a price and its inputs are a trust boundary.
 */

export const MAX_DESCRIPTION = 2000;
export const MIN_DESCRIPTION = 20;
export const MAX_SHORT_TEXT = 120;
export const MAX_LINKS = 8;

// Cast to a non-empty tuple of literals: `z.enum` needs the tuple shape, and
// keeping the literals is what makes a translation lookup on a selected key
// checkable against the catalogue.
const CAPABILITY_KEYS = CAPABILITIES.map((capability) => capability.key) as unknown as [
  CapabilityKey,
  ...CapabilityKey[],
];

/** A reference the customer points us at: Figma, a live site, inspiration. */
const linkSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) => {
      if (value === "") return true;
      try {
        const url = new URL(value);
        // http(s) only: a javascript: or data: URL here would be stored and
        // later rendered, which is how a stored-XSS hole gets opened.
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Enter a full web address starting with https://" },
  );

export const draftSchema = z.object({
  /** Bumped when the shape changes, so stale saved drafts are discarded. */
  version: z.literal(1),

  buildType: z.enum(BUILD_TYPES).nullable(),

  intake: z.object({
    businessName: z.string().trim().max(MAX_SHORT_TEXT),
    industry: z.string().trim().max(MAX_SHORT_TEXT),
    description: z.string().trim().max(MAX_DESCRIPTION),
    targetCustomers: z.string().trim().max(MAX_SHORT_TEXT),
    desiredOutcome: z.string().trim().max(MAX_SHORT_TEXT),
    /** Where the business operates. Asked by Business-in-a-Box. */
    location: z.string().trim().max(MAX_SHORT_TEXT).optional(),
  }),

  design: z.object({
    approach: z.enum(DESIGN_APPROACHES).nullable(),
    /** Figma files, existing sites, inspiration. */
    referenceLinks: z.array(linkSchema).max(MAX_LINKS),
    /** Free text: "navy and warm grey", or a set of hex values. */
    colourNotes: z.string().trim().max(MAX_SHORT_TEXT),
    brandNotes: z.string().trim().max(MAX_DESCRIPTION),
  }),

  selectedCapabilities: z.array(z.enum(CAPABILITY_KEYS)),

  platforms: z.array(z.enum(PLATFORM_IDS)),

  estimatedScreens: z.number().int().min(1).max(500).nullable(),

  locale: z.enum(LOCALES),

  /**
   * The Business-in-a-Box blueprint this draft started from, if any.
   *
   * Provenance only. Nothing reads it to decide a price -- the capabilities
   * above are what the engine charges for -- so a forged value can mislabel
   * an order and do nothing else, and the server re-checks it against the
   * published versions before it is stored with one.
   */
  blueprint: z
    .object({
      key: z.string().regex(BLUEPRINT_KEY_PATTERN),
      version: z.number().int().min(0).max(100_000),
      /** The name as the customer saw it, for display beside the draft. */
      name: z.string().trim().max(MAX_SHORT_TEXT),
      features: z.array(z.enum(FEATURE_IDS)).max(FEATURE_IDS.length),
      goals: z.array(z.enum(GOAL_IDS)).max(GOAL_IDS.length),
    })
    .optional(),
});

export type ConfiguratorDraft = z.infer<typeof draftSchema>;

export function createEmptyDraft(locale: ConfiguratorDraft["locale"]): ConfiguratorDraft {
  return {
    version: 1,
    buildType: null,
    intake: {
      businessName: "",
      industry: "",
      description: "",
      targetCustomers: "",
      desiredOutcome: "",
    },
    design: { approach: null, referenceLinks: [], colourNotes: "", brandNotes: "" },
    selectedCapabilities: [],
    platforms: [],
    estimatedScreens: null,
    locale,
  };
}

/* -------------------------------------------------------------------------
 * Steps
 * ---------------------------------------------------------------------- */

export const STEP_IDS = [
  "type",
  "intake",
  "design",
  "features",
  "platform",
  "scope",
  "review",
  "start",
] as const;

export type StepId = (typeof STEP_IDS)[number];

/** Steps the customer fills in; the rest are derived from them. */
export const INPUT_STEPS: readonly StepId[] = [
  "type",
  "intake",
  "design",
  "features",
  "platform",
];

export function stepIndex(step: StepId): number {
  return STEP_IDS.indexOf(step);
}

/**
 * Why a step cannot be completed yet.
 *
 * Returns a translation key suffix rather than a message, so the reason can be
 * shown in the customer's own language. `null` means the step is satisfied.
 */
export type StepIssue =
  | "chooseType"
  | "describeMore"
  | "needBusinessName"
  | "chooseDesign"
  | "needDirection"
  | "choosePlatform"
  | "platformConflict"
  | "platformUnavailable"
  | "completeEarlierSteps"
  | null;

export function validateStep(step: StepId, draft: ConfiguratorDraft): StepIssue {
  switch (step) {
    case "type":
      return draft.buildType ? null : "chooseType";

    case "intake": {
      if (draft.intake.description.trim().length < MIN_DESCRIPTION) return "describeMore";
      if (draft.intake.businessName.trim() === "") return "needBusinessName";
      return null;
    }

    case "design": {
      if (!draft.design.approach) return "chooseDesign";
      // A customer who says they know what they want, then gives us nothing to
      // work from, produces a brief we cannot build to. Asking here is far
      // cheaper than discovering it on day one of the countdown.
      if (
        draft.design.approach !== "design_for_me" &&
        draft.design.referenceLinks.filter(Boolean).length === 0 &&
        draft.design.brandNotes.trim() === "" &&
        draft.design.colourNotes.trim() === ""
      ) {
        return "needDirection";
      }
      return null;
    }

    case "features":
      // Legitimately optional: a brochure site may select nothing at all.
      return null;

    case "platform": {
      if (!draft.buildType) return "chooseType";
      const conflict = platformConflict(draft.buildType, draft.platforms);
      if (conflict === "empty") return "choosePlatform";
      if (conflict === "cross_platform_with_native") return "platformConflict";
      if (conflict === "not_available") return "platformUnavailable";
      return null;
    }

    // Derived steps: reachable only once every input step is satisfied.
    case "scope":
    case "review":
    case "start":
      return firstUnsatisfiedStep(draft) ? "completeEarlierSteps" : null;
  }
}

/** The earliest input step still blocking progress, or null when all pass. */
export function firstUnsatisfiedStep(draft: ConfiguratorDraft): StepId | null {
  for (const step of INPUT_STEPS) {
    if (validateStep(step, draft)) return step;
  }
  return null;
}

/**
 * Applies the consequences of changing the build type.
 *
 * Capabilities and platforms are scoped to a build type, so carrying a mobile
 * selection into a website configuration would produce a scope that cannot be
 * built. Resetting them is the only safe move; silently filtering would leave
 * the customer with a quieter version of the same surprise.
 */
export function applyBuildType(
  draft: ConfiguratorDraft,
  buildType: BuildType,
): ConfiguratorDraft {
  if (draft.buildType === buildType) return draft;
  return {
    ...draft,
    buildType,
    selectedCapabilities: [],
    platforms: defaultPlatformsFor(buildType),
  };
}
