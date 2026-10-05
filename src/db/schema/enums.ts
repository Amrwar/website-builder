import { pgEnum } from "drizzle-orm/pg-core";

import { BUILD_TYPES } from "@/config/products";
import { USER_ROLES } from "@/config/roles";
import { SUPPORTED_CURRENCIES } from "@/lib/pricing/money";

/**
 * Postgres enums.
 *
 * Where a union already exists in application config it is reused here rather
 * than retyped, so the database and the domain cannot drift. Adding a value in
 * config produces a migration, which is the point: the change becomes visible
 * and reviewable instead of silent.
 */

/**
 * Authorization roles. Defined in `@/config/roles` so the union is reachable
 * from client code without pulling the database layer with it.
 */
export const userRoleEnum = pgEnum("user_role", USER_ROLES);

/** website | system | mobileApp */
export const buildTypeEnum = pgEnum("build_type", BUILD_TYPES);

export const currencyEnum = pgEnum("currency", SUPPORTED_CURRENCIES);

/**
 * Scope tiers, smallest first.
 *
 * `custom` is terminal: it means the work cannot be sold at a published price
 * and needs a human quotation.
 */
export const SCOPE_TIERS = ["essential", "extended", "advanced", "custom"] as const;
export type ScopeTierId = (typeof SCOPE_TIERS)[number];
export const scopeTierEnum = pgEnum("scope_tier", SCOPE_TIERS);

/**
 * Project lifecycle.
 *
 * The distinction between `awaiting_assets` and `in_build` is the delivery
 * guarantee itself: payment alone does not start the countdown, because the
 * customer's required information and assets must be in before work can
 * begin. The clock starts on the transition into `in_build`, never earlier.
 */
export const PROJECT_STATUSES = [
  /** Being configured; no commitment yet. */
  "draft",
  /** Scope assessed and a price issued. */
  "quoted",
  /** Scope exceeds the published ladder; a human quote is owed. */
  "awaiting_quote",
  "awaiting_payment",
  /** Paid, but the guarantee countdown has NOT started. */
  "awaiting_assets",
  /** Countdown running. */
  "in_build",
  "in_preview",
  "awaiting_approval",
  "approved",
  /** For mobile apps this covers store submission, which is outside the guarantee. */
  "launching",
  "launched",
  "cancelled",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const projectStatusEnum = pgEnum("project_status", PROJECT_STATUSES);

/**
 * What produced a scope assessment.
 *
 * Recorded so an assessment can always be traced to its origin. When an LLM
 * assessor is added it writes `llm` here; nothing else about the schema
 * changes, and historical rule-engine assessments stay distinguishable.
 */
export const ASSESSMENT_SOURCES = ["rule_engine", "llm", "manual_override"] as const;
export type AssessmentSource = (typeof ASSESSMENT_SOURCES)[number];
export const assessmentSourceEnum = pgEnum("assessment_source", ASSESSMENT_SOURCES);

/** How the customer wants the design handled. */
export const DESIGN_APPROACHES = [
  /** "Design it for me". */
  "design_for_me",
  /** Customer supplies brand assets and direction. */
  "supplied_brand",
  /** Rebuild or extend an existing design. */
  "existing_design",
] as const;
export type DesignApproach = (typeof DESIGN_APPROACHES)[number];
export const designApproachEnum = pgEnum("design_approach", DESIGN_APPROACHES);

/** Who caused a recorded event. */
export const ACTOR_TYPES = ["customer", "staff", "system"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];
export const actorTypeEnum = pgEnum("actor_type", ACTOR_TYPES);
