import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import type { DetectedCapability, TierReason } from "@/lib/scope/types";
import {
  assessmentSourceEnum,
  buildTypeEnum,
  currencyEnum,
  scopeTierEnum,
} from "./enums";
import { projects } from "./projects";

/**
 * Scope assessments -- append-only.
 *
 * Every run of the scope engine writes a new row; rows are never updated. A
 * quoted price is a commercial statement, so the inputs, the ruleset version
 * and the resulting decision all have to remain reproducible after the rules
 * move on. Re-assessing a project adds a row rather than rewriting history.
 *
 * `assessorId` and `assessorVersion` are what make that reproducible, and they
 * are also how rule-engine and (later) LLM assessments stay distinguishable in
 * the same table.
 */
export const scopeAssessments = pgTable(
  "scope_assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * The project this assessment belongs to.
     *
     * Nullable since Phase 6. An assessment is produced when a quote is
     * priced, which happens *before* payment and therefore before a project
     * exists -- requiring a project here would have meant either inventing one
     * at checkout or not storing the reasoning behind a quoted price at all.
     * The order side of the link is `order_items.scope_assessment_id`; this
     * column is set when the order is fulfilled and the project is created.
     */
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),

    source: assessmentSourceEnum("source").notNull(),
    /** e.g. "rule-engine". */
    assessorId: text("assessor_id").notNull(),
    /** Ruleset version, e.g. "2026.10.1". */
    assessorVersion: text("assessor_version").notNull(),

    buildType: buildTypeEnum("build_type").notNull(),
    tier: scopeTierEnum("tier").notNull(),
    complexityPoints: integer("complexity_points").notNull().default(0),

    /** Detected capabilities with the evidence for each. */
    capabilities: jsonb("capabilities")
      .$type<DetectedCapability[]>()
      .notNull()
      .default([]),

    /** Plain-language reasons, as translation codes plus their triggers. */
    reasons: jsonb("reasons").$type<TierReason[]>().notNull().default([]),

    requiresCustomQuote: boolean("requires_custom_quote").notNull().default(false),

    /** Null when a custom quote is required. */
    priceMinorUnits: integer("price_minor_units"),
    currency: currencyEnum("currency").notNull().default("CAD"),
    guaranteedDays: integer("guaranteed_days"),

    /**
     * A copy of the inputs this decision was made from. Without it the row
     * records a verdict with no way to re-derive it, since the brief is
     * revised in place.
     */
    inputSnapshot: jsonb("input_snapshot").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /** "Latest assessment for this project" is the hot read. */
    index("scope_assessments_project_created_idx").on(
      table.projectId,
      table.createdAt.desc(),
    ),
  ],
);

export const scopeAssessmentsRelations = relations(scopeAssessments, ({ one }) => ({
  project: one(projects, {
    fields: [scopeAssessments.projectId],
    references: [projects.id],
  }),
}));

export type ScopeAssessmentRow = typeof scopeAssessments.$inferSelect;
export type NewScopeAssessmentRow = typeof scopeAssessments.$inferInsert;
