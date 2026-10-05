import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { customers } from "./customers";
import { buildTypeEnum, currencyEnum, projectStatusEnum, scopeTierEnum } from "./enums";
import { projectBriefs } from "./briefs";
import { scopeAssessments } from "./scope-assessments";
import { projectEvents } from "./events";

/**
 * Projects -- a single ordered build.
 *
 * The timestamp columns encode the delivery guarantee and are the reason this
 * table exists in this shape:
 *
 *   paidAt            money received; the clock is NOT running
 *   assetsSubmittedAt required information and assets are in
 *   buildStartedAt    the build officially starts; the clock STARTS HERE
 *   deadlineAt        buildStartedAt + guaranteedDays, stored not derived
 *   deliveredAt       work presented for approval; the clock STOPS HERE
 *
 * `deadlineAt` is persisted rather than computed on read so that deadline-risk
 * detection is an indexed query over all open projects, rather than a scan
 * that recomputes dates per row.
 */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Human-facing identifier shown to the customer, e.g. "BL-2026-0042". */
    reference: text("reference").notNull(),

    customerId: uuid("customer_id")
      .notNull()
      // A customer cannot be hard-deleted while builds exist; their history is
      // financial and contractual record.
      .references(() => customers.id, { onDelete: "restrict" }),

    buildType: buildTypeEnum("build_type").notNull(),

    /** Null until the scope engine has run. */
    scopeTier: scopeTierEnum("scope_tier"),

    status: projectStatusEnum("status").notNull().default("draft"),

    /**
     * Agreed price, in integer minor units of `currency`.
     *
     * Null while a project is in draft or awaiting a custom quotation. Copied
     * onto the project at the point of agreement rather than read live from
     * the assessment, so later rule changes cannot retroactively alter what
     * the customer agreed to pay.
     */
    priceMinorUnits: integer("price_minor_units"),
    currency: currencyEnum("currency").notNull().default("CAD"),

    /** Guaranteed development days, fixed at the point of agreement. */
    guaranteedDays: integer("guaranteed_days"),

    paidAt: timestamp("paid_at", { withTimezone: true }),
    assetsSubmittedAt: timestamp("assets_submitted_at", { withTimezone: true }),
    buildStartedAt: timestamp("build_started_at", { withTimezone: true }),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    launchedAt: timestamp("launched_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("projects_reference_key").on(table.reference),
    index("projects_customer_id_idx").on(table.customerId),
    index("projects_status_idx").on(table.status),
    /** Drives deadline-risk detection in the admin queue. */
    index("projects_deadline_at_idx").on(table.deadlineAt),
  ],
);

export const projectsRelations = relations(projects, ({ one, many }) => ({
  customer: one(customers, {
    fields: [projects.customerId],
    references: [customers.id],
  }),
  brief: one(projectBriefs),
  assessments: many(scopeAssessments),
  events: many(projectEvents),
}));

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
