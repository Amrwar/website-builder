import { z } from "zod";

import {
  BLUEPRINT_KEY_PATTERN,
  BUSINESS_FEATURES,
  BUSINESS_GOALS,
  FEATURE_IDS,
  GOAL_IDS,
  getBusinessFeature,
  type BusinessFeature,
  type BusinessFeatureId,
  type BusinessGoalId,
  type RecommendationLevel,
  type ShippedBlueprint,
} from "@/config/business";
import { LOCALES, type Locale } from "@/config/locales";
import { defaultPlatformsFor } from "@/config/platforms";
import { BUILD_TYPES, type BuildType } from "@/config/products";
import {
  MAX_DESCRIPTION,
  MAX_SHORT_TEXT,
  MIN_DESCRIPTION,
  createEmptyDraft,
  type ConfiguratorDraft,
} from "@/lib/configurator/draft";
import type { CapabilityKey } from "@/lib/scope";

/**
 * Blueprints as data, and what a customer's answers make of one.
 *
 * Pure: no database, no session. The server resolves which version of a
 * blueprint is live and hands it here; the browser runs the same functions to
 * show the recommendation; the admin editor validates against the same
 * schema. One rule, wherever it is evaluated.
 */

/* -------------------------------------------------------------------------
 * Definition
 * ---------------------------------------------------------------------- */

export const MAX_BLUEPRINT_NAME = 60;
export const MAX_BLUEPRINT_SUMMARY = 200;

const copySchema = z.object({
  name: z.string().trim().min(2).max(MAX_BLUEPRINT_NAME),
  summary: z.string().trim().min(10).max(MAX_BLUEPRINT_SUMMARY),
});

export type BlueprintCopy = z.infer<typeof copySchema>;

/** Every language or none: a blueprint half-translated renders raw keys. */
export const copySetSchema = z.object(
  Object.fromEntries(LOCALES.map((locale) => [locale, copySchema])) as Record<
    Locale,
    typeof copySchema
  >,
);

export type BlueprintCopySet = Record<Locale, BlueprintCopy>;

export const blueprintKeySchema = z.string().regex(BLUEPRINT_KEY_PATTERN, {
  message: "Use 2–48 lowercase letters, digits or underscores, starting with a letter.",
});

/**
 * One version of a blueprint.
 *
 * `copy` is null for a shipped blueprint whose words come from the
 * translation catalogues, and required for one an administrator created --
 * the service enforces the second half, since only it knows which is which.
 */
export const blueprintDefinitionSchema = z
  .object({
    categoryKey: blueprintKeySchema,
    buildType: z.enum(BUILD_TYPES),
    recommended: z.array(z.enum(FEATURE_IDS)).min(1, {
      message: "Recommend at least one feature.",
    }),
    optional: z.array(z.enum(FEATURE_IDS)),
    copy: copySetSchema.nullable(),
  })
  .superRefine((value, context) => {
    const seen = new Set<string>();
    for (const id of [...value.recommended, ...value.optional]) {
      if (seen.has(id)) {
        context.addIssue({
          code: "custom",
          message: `"${id}" is listed twice; a feature has one level.`,
        });
      }
      seen.add(id);
    }
  });

export type BlueprintDefinition = z.infer<typeof blueprintDefinitionSchema>;

export function definitionFromShipped(blueprint: ShippedBlueprint): BlueprintDefinition {
  return {
    categoryKey: blueprint.categoryKey,
    buildType: blueprint.buildType,
    recommended: [...blueprint.recommended],
    optional: [...blueprint.optional],
    copy: null,
  };
}

/**
 * A blueprint as the customer sees it: one live version, with its words
 * already resolved into the viewer's language.
 */
export interface ResolvedBlueprint {
  key: string;
  /** 0 for the shipped definition, otherwise the published database version. */
  version: number;
  categoryKey: string;
  buildType: BuildType;
  recommended: readonly BusinessFeatureId[];
  optional: readonly BusinessFeatureId[];
  name: string;
  summary: string;
}

export function baseLevel(
  blueprint: Pick<ResolvedBlueprint, "recommended" | "optional">,
  featureId: BusinessFeatureId,
): RecommendationLevel {
  if (blueprint.recommended.includes(featureId)) return "recommended";
  if (blueprint.optional.includes(featureId)) return "optional";
  return "not_needed";
}

/* -------------------------------------------------------------------------
 * Recommendation
 * ---------------------------------------------------------------------- */

export interface FeatureRecommendation {
  feature: BusinessFeature;
  level: RecommendationLevel;
  /** The goals that moved it, so the screen can say why. */
  promotedBy: readonly BusinessGoalId[];
}

const PROMOTION: Record<RecommendationLevel, RecommendationLevel> = {
  optional: "recommended",
  not_needed: "optional",
  recommended: "recommended",
};

/**
 * Every feature, at the level this blueprint and these goals put it.
 *
 * A goal moves a feature one level, never two: "sell online" for a barber
 * surfaces an online store as an option rather than recommending a shop to
 * someone the blueprint says does not usually run one. Two goals arguing for
 * the same feature still move it once. That keeps the recommendation
 * explainable in one sentence, which is the property worth having in a
 * rule-based system that says it is rule-based.
 */
export function recommend(
  blueprint: Pick<ResolvedBlueprint, "recommended" | "optional">,
  goals: readonly BusinessGoalId[],
): FeatureRecommendation[] {
  const chosen = new Set(goals);
  return BUSINESS_FEATURES.map((feature) => {
    const promotedBy = BUSINESS_GOALS.filter(
      (goal) =>
        chosen.has(goal.id) && (goal.promotes as readonly string[]).includes(feature.id),
    ).map((goal) => goal.id);
    const base = baseLevel(blueprint, feature.id);
    const level = promotedBy.length > 0 ? PROMOTION[base] : base;
    return {
      feature,
      level,
      // Reported only when it changed something.
      promotedBy: level === base ? [] : promotedBy,
    };
  });
}

/** What starts switched on: everything recommended, nothing else. */
export function initialSelection(
  recommendations: readonly FeatureRecommendation[],
): BusinessFeatureId[] {
  return recommendations
    .filter((entry) => entry.level === "recommended")
    .map((entry) => entry.feature.id as BusinessFeatureId);
}

/* -------------------------------------------------------------------------
 * Into the engine's vocabulary
 * ---------------------------------------------------------------------- */

/**
 * The capabilities a set of features needs, deduplicated.
 *
 * Ordering and an online store both need a product catalogue; choosing both
 * must not charge for it twice.
 */
export function capabilitiesFor(featureIds: readonly string[]): CapabilityKey[] {
  const keys = new Set<CapabilityKey>();
  for (const id of featureIds) {
    for (const key of getBusinessFeature(id)?.provides ?? []) keys.add(key);
  }
  return [...keys];
}

/** Screens the selection adds up to, within the draft schema's bounds. */
export function screensFor(featureIds: readonly string[]): number {
  const total = featureIds.reduce(
    (sum, id) => sum + (getBusinessFeature(id)?.screens ?? 0),
    0,
  );
  return Math.min(Math.max(total, 1), 500);
}

/* -------------------------------------------------------------------------
 * The customer's answers
 * ---------------------------------------------------------------------- */

export const businessDetailsSchema = z.object({
  businessName: z.string().trim().min(1).max(MAX_SHORT_TEXT),
  location: z.string().trim().max(MAX_SHORT_TEXT),
  targetCustomers: z.string().trim().max(MAX_SHORT_TEXT),
  /** What they sell. Becomes the brief's description, so it has its minimum. */
  offering: z.string().trim().min(MIN_DESCRIPTION).max(MAX_DESCRIPTION),
  goals: z.array(z.enum(GOAL_IDS)).max(GOAL_IDS.length),
});

export type BusinessDetails = z.infer<typeof businessDetailsSchema>;

export type DetailsIssue = "needBusinessName" | "describeMore" | null;

export function validateDetails(details: BusinessDetails): DetailsIssue {
  if (details.businessName.trim() === "") return "needBusinessName";
  if (details.offering.trim().length < MIN_DESCRIPTION) return "describeMore";
  return null;
}

export interface DraftFromBlueprintInput {
  blueprint: ResolvedBlueprint;
  details: BusinessDetails;
  selected: readonly BusinessFeatureId[];
  locale: Locale;
  /** The chosen goals in the customer's language, for the brief's outcome line. */
  goalSummary: string;
}

/**
 * The configurator draft a blueprint and its answers amount to.
 *
 * This is the whole integration with the rest of the platform: from here on
 * a Business-in-a-Box order is an ordinary draft, priced by the same engine,
 * checked out by the same checkout and built by the same production line.
 * The blueprint is recorded alongside as provenance -- which one, which
 * version, which features -- and is never an input to the price.
 *
 * Design is left unanswered on purpose. The configurator asks it next, and a
 * blueprint has no business guessing someone's brand.
 */
export function draftFromBlueprint(input: DraftFromBlueprintInput): ConfiguratorDraft {
  const { blueprint, details, selected, locale } = input;
  const base = createEmptyDraft(locale);
  const truncate = (value: string) => value.trim().slice(0, MAX_SHORT_TEXT);

  return {
    ...base,
    buildType: blueprint.buildType,
    intake: {
      businessName: truncate(details.businessName),
      industry: truncate(blueprint.name),
      description: details.offering.trim().slice(0, MAX_DESCRIPTION),
      targetCustomers: truncate(details.targetCustomers),
      desiredOutcome: truncate(input.goalSummary),
      location: truncate(details.location),
    },
    selectedCapabilities: capabilitiesFor(selected),
    platforms: [...defaultPlatformsFor(blueprint.buildType)],
    estimatedScreens: screensFor(selected),
    blueprint: {
      key: blueprint.key,
      version: blueprint.version,
      name: truncate(blueprint.name),
      features: [...selected],
      goals: [...details.goals],
    },
  };
}
