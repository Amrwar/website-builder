import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  validationCaptureModeEnum,
  validationEventKindEnum,
  validationStatusEnum,
} from "./enums";
import { users } from "./users";

/**
 * Test my business idea.
 *
 * An experiment is a public landing page with a fixed offer. Its content is
 * frozen at publication: to try a different headline or price, the customer
 * closes this test and starts another, so the numbers on one test always
 * describe one page. Comparing a page against an edited version of itself
 * would make every ratio meaningless.
 *
 * Owned by one user and deleted with them, leads included -- those are
 * other people's contact details, held for that customer and nobody else.
 */
export const validationExperiments = pgTable(
  "validation_experiments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Public address: a readable stem and a random suffix. Never reused. */
    slug: text("slug").notNull(),
    status: validationStatusEnum("status").notNull().default("live"),
    locale: text("locale").notNull(),
    captureMode: validationCaptureModeEnum("capture_mode").notNull(),
    /** A `ValidationContent`, validated before it is written. */
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("validation_experiments_slug_key").on(table.slug),
    index("validation_experiments_owner_idx").on(table.ownerUserId),
  ],
);

/**
 * What happened on a page.
 *
 * `visitorHash` is a salted hash of the visitor's network prefix and browser,
 * rotated daily and scoped to the experiment: it counts distinct visitors
 * without a cookie and without anything that could be followed across pages
 * or days. Null when no salt is configured, in which case the results count
 * views and say so.
 */
export const validationEvents = pgTable(
  "validation_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    experimentId: uuid("experiment_id")
      .notNull()
      .references(() => validationExperiments.id, { onDelete: "cascade" }),
    kind: validationEventKindEnum("kind").notNull(),
    visitorHash: text("visitor_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("validation_events_experiment_kind_idx").on(
      table.experimentId,
      table.kind,
      table.createdAt,
    ),
  ],
);

/** People who asked to hear more. Shown to the experiment's owner only. */
export const validationLeads = pgTable(
  "validation_leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    experimentId: uuid("experiment_id")
      .notNull()
      .references(() => validationExperiments.id, { onDelete: "cascade" }),
    kind: validationCaptureModeEnum("kind").notNull(),
    name: text("name"),
    email: text("email").notNull(),
    message: text("message"),
    /** When they agreed to be contacted by this business. Required. */
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("validation_leads_experiment_idx").on(table.experimentId, table.createdAt),
  ],
);

export type ValidationExperimentRow = typeof validationExperiments.$inferSelect;
export type ValidationLeadRow = typeof validationLeads.$inferSelect;
