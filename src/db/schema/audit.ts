import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { auditCategoryEnum } from "./enums";
import { users } from "./users";

/**
 * The central audit log.
 *
 * `project_events` is the activity feed for one project and is shown to
 * customers. This is the company's record of security- and money-sensitive
 * acts, most of which do not belong to a project at all: a role change, a
 * refund, a configuration edit.
 *
 * Append-only by policy and by permission -- there is no update or delete path
 * in the application, `audit:read` is restricted to the two senior ranks, and
 * the write helper is the only way in. Nothing in the admin console can edit a
 * row here, which is the entire point of having it.
 *
 * ── On what is stored ─────────────────────────────────────────────────────
 * `before` and `after` hold the changed fields only, never whole records, and
 * never secrets. An audit log that quietly accumulates customers' tax numbers
 * becomes its own liability.
 * ──────────────────────────────────────────────────────────────────────────
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    category: auditCategoryEnum("category").notNull(),
    /** Dotted action, e.g. "user.role_changed", "refund.executed". */
    action: text("action").notNull(),

    /** Who did it. Null only for genuinely automatic system acts. */
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Snapshotted, so the entry still reads after the account is gone. */
    actorEmail: text("actor_email"),
    actorRole: text("actor_role"),

    /** What was acted on: "project", "user", "order", "refund". */
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id"),
    /** Human-quotable reference, e.g. "PRJ-2026-0001". */
    subjectLabel: text("subject_label"),

    /** Changed fields only. See the note above. */
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    after: jsonb("after").$type<Record<string, unknown> | null>(),

    /** Free-text reason, where the action demands one (refunds, overrides). */
    reason: text("reason"),

    /** Request correlation id, to join an entry to the server logs. */
    requestId: text("request_id"),

    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_events_occurred_idx").on(table.occurredAt.desc()),
    index("audit_events_category_idx").on(table.category, table.occurredAt.desc()),
    index("audit_events_subject_idx").on(table.subjectType, table.subjectId),
    index("audit_events_actor_idx").on(table.actorUserId),
  ],
);

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  actor: one(users, { fields: [auditEvents.actorUserId], references: [users.id] }),
}));

export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
