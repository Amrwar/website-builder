import { relations, sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { actorTypeEnum, eventSubjectEnum } from "./enums";
import { projects } from "./projects";

/**
 * The domain event log -- append-only.
 *
 * Backs the customer-facing Build Room timeline and doubles as the audit trail
 * for anything with commercial consequence: when the countdown started, when
 * assets landed, when a deadline was missed, when a refund was chosen.
 *
 * Deliberately not derived from the mutable columns on `projects`. Those
 * record current state; this records what happened and when, which is what a
 * disputed guarantee would be settled against.
 *
 * ── On the subject ────────────────────────────────────────────────────────
 * Not every fact worth recording is about a project. A subscription can exist
 * without one, and an order is a fact before any project exists. The table was
 * built project-only, and the cost showed up as `if (input.projectId)` around
 * an emit -- a subscription with no project recorded nothing at all, silently.
 *
 * So an event names its subject, and `projectId` is kept as the denormalised
 * column the timeline reads, set when (and only when) the subject is a
 * project. Keeping it means every existing timeline query and index is
 * untouched; a separate table would have meant writing twice to stay in step.
 *
 * The table name is now broader than `project_events` suggests. Renaming it
 * would touch every query for no behavioural gain, so it is documented rather
 * than churned.
 * ──────────────────────────────────────────────────────────────────────────
 */
export const projectEvents = pgTable(
  "project_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * What the event is about. `project` for the overwhelming majority; the
     * others exist so a fact with no project still has somewhere to go.
     */
    subjectType: eventSubjectEnum("subject_type").notNull().default("project"),
    subjectId: uuid("subject_id").notNull(),

    /**
     * Set when `subjectType` is `project`, null otherwise, and enforced by a
     * database check rather than by convention. This is what the Build Room
     * timeline and its index read, so it stays a real column rather than a
     * filter on `subject_id`.
     */
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),

    /** Dotted event name, e.g. "build.started", "deadline.missed". */
    type: text("type").notNull(),

    actorType: actorTypeEnum("actor_type").notNull(),
    /** Clerk user id for customer/staff actors; null for system events. */
    actorId: text("actor_id"),

    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),

    /**
     * When the event actually occurred, which is not always when the row was
     * written -- a missed deadline is detected by a scheduled job after the
     * fact, and the timeline must show the real moment.
     */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("project_events_project_occurred_idx").on(
      table.projectId,
      table.occurredAt.desc(),
    ),
    index("project_events_type_idx").on(table.type),
    index("project_events_subject_idx").on(table.subjectType, table.subjectId),

    /**
     * A project event must carry its project id, and nothing else may. The
     * timeline reads `project_id`, so a project event that left it null would
     * vanish from the Build Room while still existing in the log.
     */
    check(
      "project_events_project_subject_has_project_id",
      sql`(${table.subjectType} = 'project') = (${table.projectId} is not null)`,
    ),
  ],
);

export const projectEventsRelations = relations(projectEvents, ({ one }) => ({
  project: one(projects, {
    fields: [projectEvents.projectId],
    references: [projects.id],
  }),
}));

export type ProjectEvent = typeof projectEvents.$inferSelect;
export type NewProjectEvent = typeof projectEvents.$inferInsert;
