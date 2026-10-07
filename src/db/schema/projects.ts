import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./users";
import {
  buildTypeEnum,
  currencyEnum,
  productTypeEnum,
  projectStatusEnum,
  riskLevelEnum,
  scopeTierEnum,
} from "./enums";
import { products } from "./products";
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

    ownerId: uuid("owner_id")
      .notNull()
      // A user cannot be hard-deleted while builds exist; their history is
      // financial and contractual record.
      .references(() => users.id, { onDelete: "restrict" }),

    /**
     * What kind of thing this project delivers.
     *
     * Added in Phase 7 so the Build Room is driven by product type rather than
     * by build type. An automation, a business product or a feature upgrade is
     * a project like any other; the workspace reads this to decide which
     * stages, panels and approvals apply. See `config/workspace.ts`.
     *
     * Defaults to `build` because every project that existed before this
     * column was one.
     */
    productType: productTypeEnum("product_type").notNull().default("build"),

    /** The catalogue row ordered, where one applies. */
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),

    /**
     * Which build this is, for `build` products. Null is not yet possible --
     * every current product type is a build -- but the Build Room never reads
     * it, so a future automation can leave it behind.
     */
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

    /**
     * Last computed schedule risk, stored so the production queue can sort and
     * filter on it without recomputing for every open project on every load.
     *
     * Derived state, not a source of truth: `assessRisk` is deterministic, so
     * this is a cache that can always be rebuilt. `riskReasons` carries the
     * explanation alongside the level, because a red with no reason is not
     * actionable.
     */
    riskLevel: riskLevelEnum("risk_level").notNull().default("green"),
    riskReasons: jsonb("risk_reasons").$type<unknown[]>().notNull().default([]),
    riskAssessedAt: timestamp("risk_assessed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /* Foreign keys are not indexed automatically. Without these, every
       delete or key update on the referenced table scans this one to check
       the constraint, and every join on the column walks the heap. Cheap to
       hold while the tables are small; an incident to add once they are not. */
    index("projects_product_id_idx").on(table.productId),

    uniqueIndex("projects_reference_key").on(table.reference),
    index("projects_owner_id_idx").on(table.ownerId),
    index("projects_status_idx").on(table.status),
    /** Drives deadline-risk detection in the admin queue. */
    index("projects_deadline_at_idx").on(table.deadlineAt),
    /** The production queue: open projects, worst risk first. */
    index("projects_risk_idx").on(table.riskLevel, table.deadlineAt),
  ],
);

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, {
    fields: [projects.ownerId],
    references: [users.id],
  }),
  brief: one(projectBriefs),
  assessments: many(scopeAssessments),
  events: many(projectEvents),
}));

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
