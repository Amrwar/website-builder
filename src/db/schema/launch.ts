import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { projects } from "./projects";
import { users } from "./users";
import {
  checklistGroupEnum,
  checklistStateEnum,
  dnsStateEnum,
  domainVerificationEnum,
  hostingStatusEnum,
  sslStateEnum,
} from "./enums";

/**
 * Launch, hosting and domains.
 *
 * The lifecycle does not end at delivery. A build is approved, deployed,
 * launched, then hosted and maintained for as long as the customer keeps
 * paying -- and every one of those is a state somebody will eventually ask a
 * question about. "Is it live?", "why is the certificate expired?", "what was
 * deployed on the ninth?" are support questions, and a schema that cannot
 * answer them turns each into an investigation.
 */

/* -------------------------------------------------------------------------
 * The launch checklist
 * ---------------------------------------------------------------------- */

/**
 * The checklist definition.
 *
 * Configuration, not code. The previous launch panel hard-coded four steps in
 * JSX, which meant adding "analytics installed" was a deployment and a
 * different checklist per product type was impossible. These rows decide what
 * a launch requires.
 *
 * `appliesTo` holds product types; empty means every product. An item that
 * applies to nothing would be invisible, so empty is read as "all" rather than
 * "none" -- the useful default for a list somebody is editing by hand.
 */
export const launchChecklistItems = pgTable(
  "launch_checklist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Stable key. Never renamed; retired by deactivating. */
    key: text("key").notNull(),
    group: checklistGroupEnum("group").notNull(),

    /** Key under `workspace.launch.items.*`, so the list is translatable. */
    translationKey: text("translation_key").notNull(),

    /** Product types this applies to. Empty means all of them. */
    appliesTo: jsonb("applies_to").$type<string[]>().notNull().default([]),

    /**
     * A launch is blocked until every required item is done or explicitly
     * marked not applicable. Optional items are advice.
     */
    isRequired: boolean("is_required").notNull().default(true),

    /** True when the customer is the one who has to act. */
    customerVisible: boolean("customer_visible").notNull().default(true),

    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("launch_checklist_items_key_key").on(table.key),
    index("launch_checklist_items_order_idx").on(table.sortOrder),
  ],
);

/**
 * One item's state on one project.
 *
 * Rows are created lazily, when an item is first acted on. A project with no
 * rows has an entirely pending checklist, which is correct and costs nothing
 * to store.
 *
 * `itemKey` is copied rather than referenced by id so the record survives an
 * item being deleted from the definition: a launch that happened still has to
 * read back years later.
 */
export const projectLaunchChecks = pgTable(
  "project_launch_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    itemKey: text("item_key").notNull(),
    state: checklistStateEnum("state").notNull().default("pending"),

    /** Required when an item is marked not applicable: why it does not apply. */
    note: text("note"),

    completedByUserId: uuid("completed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("project_launch_checks_item_key").on(table.projectId, table.itemKey),
  ],
);

/* -------------------------------------------------------------------------
 * Hosting
 * ---------------------------------------------------------------------- */

/**
 * Where one project is hosted.
 *
 * One row per project. The provider's own identifiers are kept so a support
 * question can be answered against the provider without guessing which of
 * their projects is ours.
 *
 * Uptime is a **recorded observation**, not a claim: `uptimeCheckedAt` says
 * when it was last measured, and a figure with no timestamp beside it is a
 * number nobody should act on.
 */
export const projectHosting = pgTable(
  "project_hosting",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    status: hostingStatusEnum("status").notNull().default("pending"),

    /** Which maintenance plan pays for this, where one does. */
    planKey: text("plan_key"),

    /** e.g. "vercel". Named so a migration is a data change, not a rewrite. */
    provider: text("provider"),
    providerProjectId: text("provider_project_id"),

    /** The URL the public actually reaches. */
    productionUrl: text("production_url"),

    activatedAt: timestamp("activated_at", { withTimezone: true }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),

    /** Basis points, so 99.95% is 9995. Null until something has measured it. */
    uptimeBasisPoints: integer("uptime_basis_points"),
    uptimeCheckedAt: timestamp("uptime_checked_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("project_hosting_project_key").on(table.projectId)],
);

/* -------------------------------------------------------------------------
 * Domains
 * ---------------------------------------------------------------------- */

/**
 * A domain pointed at a project.
 *
 * Verification, DNS and SSL are three columns because they are three failures
 * with three different fixes. Collapsing them into one "domain status" would
 * produce exactly the support ticket this table exists to prevent: "it says
 * error, what do I do?"
 *
 * `ownedByCustomer` records who holds the registration. It decides who can
 * renew it, and a renewal nobody thought they were responsible for is how a
 * live site goes dark.
 */
export const domains = pgTable(
  "domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    /** Lower-cased on write. One row per hostname across the platform. */
    name: text("name").notNull(),

    /** The one the site canonically answers on. */
    isPrimary: boolean("is_primary").notNull().default(false),

    verification: domainVerificationEnum("verification").notNull().default("unverified"),
    /** The TXT record we asked them to publish, when verification is pending. */
    verificationToken: text("verification_token"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),

    dnsState: dnsStateEnum("dns_state").notNull().default("unconfigured"),
    dnsCheckedAt: timestamp("dns_checked_at", { withTimezone: true }),

    sslState: sslStateEnum("ssl_state").notNull().default("none"),
    sslIssuedAt: timestamp("ssl_issued_at", { withTimezone: true }),
    sslExpiresAt: timestamp("ssl_expires_at", { withTimezone: true }),

    /** True when the customer holds the registration, not us. */
    ownedByCustomer: boolean("owned_by_customer").notNull().default(true),
    registrar: text("registrar"),
    registrationExpiresAt: timestamp("registration_expires_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("domains_name_key").on(table.name),
    index("domains_project_idx").on(table.projectId),
    // Certificates expire quietly. This is the index behind the sweep that
    // finds them before a customer does.
    index("domains_ssl_expiry_idx").on(table.sslExpiresAt),
  ],
);

/* -------------------------------------------------------------------------
 * Relations
 * ---------------------------------------------------------------------- */

export const projectLaunchChecksRelations = relations(projectLaunchChecks, ({ one }) => ({
  project: one(projects, {
    fields: [projectLaunchChecks.projectId],
    references: [projects.id],
  }),
}));

export const projectHostingRelations = relations(projectHosting, ({ one }) => ({
  project: one(projects, {
    fields: [projectHosting.projectId],
    references: [projects.id],
  }),
}));

export const domainsRelations = relations(domains, ({ one }) => ({
  project: one(projects, { fields: [domains.projectId], references: [projects.id] }),
}));

export type LaunchChecklistItem = typeof launchChecklistItems.$inferSelect;
export type ProjectLaunchCheck = typeof projectLaunchChecks.$inferSelect;
export type ProjectHosting = typeof projectHosting.$inferSelect;
export type Domain = typeof domains.$inferSelect;
