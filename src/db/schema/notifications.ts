import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { notificationKindEnum } from "./enums";
import { projects } from "./projects";
import { users } from "./users";

/**
 * Notifications.
 *
 * One row per thing one person was told, in the language they were told it in.
 *
 * The message text is *not* stored. What is stored is the kind and its ICU
 * parameters, so the sentence is rendered from the catalogues on read. That
 * way a translation can be corrected and every past notification reads
 * correctly, which is the opposite of the right answer for an invoice: an
 * invoice is a record of an obligation and must never change, a notification
 * is a message about state the reader can still go and look at.
 *
 * `locale` is the exception, and it is snapshotted on purpose. It is the
 * recipient's preference at the moment of sending, which is what the email we
 * actually posted was written in. Re-resolving it on read would make the
 * in-app copy of a notification disagree with the email in the person's inbox
 * as soon as they change languages.
 *
 * Email delivery is recorded here rather than in a second table because there
 * is at most one attempt per notification: a retry is a new notification, for
 * the same reason a corrected invoice is a new document.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * Cascade: notifications are about a person, and they are meaningless
     * without them. Nothing financial depends on this row.
     */
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    kind: notificationKindEnum("kind").notNull(),

    /**
     * The recipient's locale at send time. See the note above: this is what
     * the message was composed in, not what they prefer today.
     */
    locale: text("locale").notNull(),

    /** ICU arguments for the message. Never the rendered sentence. */
    params: jsonb("params").notNull().default({}),

    /** What it is about, where there is something to link to. */
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),

    /**
     * Idempotency key, e.g. "order_paid:<orderId>". Unique where present, so a
     * webhook delivered twice cannot notify twice. Null for notifications with
     * no natural key, such as a staff message, where every one is distinct.
     */
    dedupeKey: text("dedupe_key"),

    readAt: timestamp("read_at", { withTimezone: true }),

    /* --- Email ---------------------------------------------------------- */

    /**
     * Set when the email channel was actually attempted. Null means it was not
     * -- the kind does not email, the recipient had it switched off, or no
     * transport is configured -- which is different from "tried and failed".
     */
    emailAttemptedAt: timestamp("email_attempted_at", { withTimezone: true }),
    emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
    emailFailedAt: timestamp("email_failed_at", { withTimezone: true }),
    /** The provider's reason. Never a credential, never the message body. */
    emailError: text("email_error"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /* Foreign keys are not indexed automatically. Without these, every
       delete or key update on the referenced table scans this one to check
       the constraint, and every join on the column walks the heap. Cheap to
       hold while the tables are small; an incident to add once they are not. */
    index("notifications_project_id_idx").on(table.projectId),

    index("notifications_recipient_id_idx").on(table.recipientId),
    index("notifications_created_at_idx").on(table.createdAt),
    /**
     * Plain, not partial. Postgres already treats NULLs as distinct in a unique
     * index, so any number of keyless notifications coexist — and a partial
     * index cannot be matched by `ON CONFLICT (dedupe_key)`, so every insert
     * through `notify()` failed. The failure was caught and logged by design,
     * so the platform recorded no notifications at all and nothing said so.
     * Found by the lifecycle integration test; the live probe of this index
     * had only ever tried plain inserts.
     */
    uniqueIndex("notifications_dedupe_key_key").on(table.dedupeKey),

    /**
     * The email columns describe one attempt, and the database enforces that
     * they describe a coherent one. Application code can be wrong; a row that
     * claims to have been both sent and failed is not recoverable later,
     * because nobody can tell which happened.
     */
    check(
      "notifications_email_outcome_needs_attempt",
      sql`(${table.emailSentAt} is null and ${table.emailFailedAt} is null)
          or ${table.emailAttemptedAt} is not null`,
    ),
    check(
      "notifications_email_one_outcome",
      sql`${table.emailSentAt} is null or ${table.emailFailedAt} is null`,
    ),
    check(
      "notifications_email_error_needs_failure",
      sql`${table.emailError} is null or ${table.emailFailedAt} is not null`,
    ),

    /**
     * This column holds a routing locale ("fr"), unlike `orders.locale` and
     * `invoices.locale` which hold a full `intlTag` ("fr-CA") because they are
     * pricing snapshots. The two are easy to confuse at a call site and the
     * symptom -- a notification that renders its own message keys -- would
     * only show up in a customer's inbox, so the difference is enforced here.
     *
     * Adding a language therefore needs a migration. That is the right cost: a
     * new language is a deliberate release, not a runtime configuration.
     */
    check("notifications_locale_is_served", sql`${table.locale} in ('en', 'fr', 'ar')`),
  ],
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  recipient: one(users, {
    fields: [notifications.recipientId],
    references: [users.id],
  }),
  project: one(projects, {
    fields: [notifications.projectId],
    references: [projects.id],
  }),
}));

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
