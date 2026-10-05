import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { actorTypeEnum } from "./enums";
import { projects } from "./projects";

/**
 * Project timeline -- append-only.
 *
 * Backs the customer-facing Build Room timeline and doubles as the audit trail
 * for anything with commercial consequence: when the countdown started, when
 * assets landed, when a deadline was missed, when a refund was chosen.
 *
 * Deliberately not derived from the mutable columns on `projects`. Those
 * record current state; this records what happened and when, which is what a
 * disputed guarantee would be settled against.
 */
export const projectEvents = pgTable(
  "project_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

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
