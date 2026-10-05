import { relations } from "drizzle-orm";
import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { designApproachEnum } from "./enums";
import { projects } from "./projects";

/**
 * What the customer asked for.
 *
 * Holds both halves of the intake: the free-text description in the
 * customer's own words, and the structured configurator answers. The scope
 * engine reads both, and keeping them separate matters -- a configurator
 * selection is an explicit statement of intent, whereas free text is only a
 * signal, and the engine weights them differently.
 *
 * One brief per project, revised in place; the assessment history in
 * `scope_assessments` is what preserves the trail of how the scope moved.
 */
export const projectBriefs = pgTable(
  "project_briefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    /** The customer's own words. Never rewritten; this is evidence. */
    ideaText: text("idea_text").notNull().default(""),

    /** Locale the brief was written in, so text rules match the right language. */
    ideaLocale: text("idea_locale").notNull().default("en"),

    /**
     * Capability keys explicitly chosen in the configurator.
     * Typed as `string[]` rather than a narrower union because the capability
     * registry is versioned in code and may legitimately outrun old rows.
     */
    selectedCapabilities: jsonb("selected_capabilities")
      .$type<string[]>()
      .notNull()
      .default([]),

    designApproach: designApproachEnum("design_approach"),

    /** Declared page/screen count, when the customer gives one. */
    estimatedScreens: integer("estimated_screens"),

    /** Reference sites or apps the customer pointed at. */
    referenceUrls: jsonb("reference_urls").$type<string[]>().notNull().default([]),

    /**
     * Uploaded brand assets, held as Vercel Blob pathnames rather than URLs:
     * the store is private, so access is issued at read time and a stored URL
     * would be a stale credential.
     */
    assetPathnames: jsonb("asset_pathnames").$type<string[]>().notNull().default([]),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("project_briefs_project_id_key").on(table.projectId)],
);

export const projectBriefsRelations = relations(projectBriefs, ({ one }) => ({
  project: one(projects, {
    fields: [projectBriefs.projectId],
    references: [projects.id],
  }),
}));

export type ProjectBrief = typeof projectBriefs.$inferSelect;
export type NewProjectBrief = typeof projectBriefs.$inferInsert;
