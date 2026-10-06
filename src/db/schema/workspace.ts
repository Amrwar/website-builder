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

import {
  actorTypeEnum,
  approvalKindEnum,
  approvalStatusEnum,
  changeRequestStatusEnum,
  currencyEnum,
  deploymentEnvironmentEnum,
  deploymentStateEnum,
  fileKindEnum,
  fileVisibilityEnum,
  userRoleEnum,
} from "./enums";
import { orders } from "./orders";
import { projects } from "./projects";
import { users } from "./users";

/**
 * The Build Room.
 *
 * Everything here hangs off `projects`, which is the single workspace subject.
 * That is what makes the room reusable: a website, a system, an app, an
 * automation and a business product are all projects differing by
 * `product_type`, so none of these tables needs to know which kind it is
 * attached to. What varies per product is configuration, not structure --
 * see `config/workspace.ts`.
 */

/* -------------------------------------------------------------------------
 * Team
 * ---------------------------------------------------------------------- */

/**
 * Who is on a project, including the customer.
 *
 * The customer is a member too, which looks odd until you need unread state:
 * "where has this person read up to" is the same question for a developer and
 * for the person paying, and one table answers it for both.
 */
export const projectMembers = pgTable(
  "project_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** The hat they wear on this project, which need not equal their global role. */
    role: userRoleEnum("role").notNull(),

    /**
     * How far this person has read the activity feed. Unread counts are
     * derived from it rather than stored, so they cannot drift out of step
     * with the events they describe.
     */
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),

    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("project_members_project_user_key").on(table.projectId, table.userId),
    index("project_members_user_idx").on(table.userId),
  ],
);

/* -------------------------------------------------------------------------
 * Files
 * ---------------------------------------------------------------------- */

/**
 * Files on a project.
 *
 * Versioning is by `groupKey` plus `version` rather than by overwriting: a
 * customer who re-uploads a logo has two versions, and the build team needs to
 * know which one the work was done against. The newest version of a group is
 * the one with no successor.
 *
 * `pathname` is the blob store key, never a public URL. Access is granted per
 * request after an authorization check, so a leaked row cannot become a leaked
 * file.
 */
export const projectFiles = pgTable(
  "project_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    kind: fileKindEnum("kind").notNull(),
    visibility: fileVisibilityEnum("visibility").notNull().default("internal"),

    /** Null for files the system generated. */
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    name: text("name").notNull(),
    /** Stable across versions; the newest row in a group is the current file. */
    groupKey: text("group_key").notNull(),
    version: integer("version").notNull().default(1),

    /** Blob store key. Never rendered directly; see the note above. */
    pathname: text("pathname").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),

    note: text("note"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("project_files_project_idx").on(table.projectId, table.createdAt.desc()),
    uniqueIndex("project_files_group_version_key").on(
      table.projectId,
      table.groupKey,
      table.version,
    ),
    /** "Has the customer sent their assets yet?" has to be an indexed question. */
    index("project_files_kind_idx").on(table.projectId, table.kind),
  ],
);

/* -------------------------------------------------------------------------
 * Messages
 * ---------------------------------------------------------------------- */

export const projectMessages = pgTable(
  "project_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    authorUserId: uuid("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Kept even when the author row is gone, so a thread still reads correctly. */
    authorType: actorTypeEnum("author_type").notNull(),
    authorName: text("author_name").notNull(),

    body: text("body").notNull(),

    /**
     * File ids, as a json array rather than a join table. A message's
     * attachments are only ever read with the message, never queried across,
     * so a join table would add a table and buy nothing.
     */
    attachmentFileIds: jsonb("attachment_file_ids")
      .$type<string[]>()
      .notNull()
      .default([]),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
  },
  (table) => [
    index("project_messages_project_idx").on(table.projectId, table.createdAt.desc()),
  ],
);

/* -------------------------------------------------------------------------
 * Change requests
 * ---------------------------------------------------------------------- */

/**
 * A request to change the scope after it was agreed.
 *
 * The scope and price impact are explicit columns rather than prose, because
 * this is where the fixed-price promise is kept honest: a change that adds
 * work adds days and money, and the customer sees both before approving. A
 * change request with a price impact becomes its own order.
 */
export const changeRequests = pgTable(
  "change_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    reference: text("reference").notNull(),

    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    title: text("title").notNull(),
    description: text("description").notNull(),
    attachmentFileIds: jsonb("attachment_file_ids")
      .$type<string[]>()
      .notNull()
      .default([]),

    status: changeRequestStatusEnum("status").notNull().default("submitted"),

    /** Capability keys this change adds, for re-assessment. */
    scopeImpact: jsonb("scope_impact").$type<string[]>().notNull().default([]),
    /** Plain-language summary of what changes, written by whoever assessed it. */
    scopeNote: text("scope_note"),

    priceImpactMinorUnits: integer("price_impact_minor_units"),
    currency: currencyEnum("currency").notNull().default("CAD"),
    /** Working days added to the guarantee if approved. */
    additionalDays: integer("additional_days"),

    /** The order raised to pay for this change, once there is one. */
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),

    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("change_requests_reference_key").on(table.reference),
    index("change_requests_project_idx").on(table.projectId, table.createdAt.desc()),
    index("change_requests_status_idx").on(table.status),
  ],
);

/* -------------------------------------------------------------------------
 * Approvals
 * ---------------------------------------------------------------------- */

/**
 * Sign-offs.
 *
 * Append-only per round: asking again after changes creates a new row rather
 * than reopening the old one, so "they approved the design, then we changed
 * it" stays visible instead of being overwritten.
 */
export const projectApprovals = pgTable(
  "project_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    kind: approvalKindEnum("kind").notNull(),
    status: approvalStatusEnum("status").notNull().default("pending"),

    /** Which round of this approval, starting at 1. */
    round: integer("round").notNull().default(1),

    /** What is being approved: a deployment id, a file id, a scope version. */
    subjectRef: text("subject_ref"),
    summary: text("summary"),

    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),

    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    note: text("note"),
  },
  (table) => [
    uniqueIndex("project_approvals_kind_round_key").on(
      table.projectId,
      table.kind,
      table.round,
    ),
    index("project_approvals_project_idx").on(table.projectId),
  ],
);

/* -------------------------------------------------------------------------
 * Deployments
 * ---------------------------------------------------------------------- */

/**
 * Preview and production deployments.
 *
 * One row per deployment rather than a mutable "current preview URL" on the
 * project, so a customer can see that the thing they approved on Tuesday is
 * not the thing they are looking at today.
 */
export const deployments = pgTable(
  "deployments",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    environment: deploymentEnvironmentEnum("environment").notNull(),
    state: deploymentStateEnum("state").notNull().default("queued"),

    /** Customer-facing label, e.g. "v3". */
    version: text("version").notNull(),
    url: text("url"),

    /** What was deployed, for the build team. */
    commitRef: text("commit_ref"),
    note: text("note"),

    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    failureReason: text("failure_reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("deployments_project_idx").on(table.projectId, table.createdAt.desc()),
    index("deployments_environment_idx").on(table.projectId, table.environment),
  ],
);

/* -------------------------------------------------------------------------
 * Relations
 * ---------------------------------------------------------------------- */

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, {
    fields: [projectMembers.projectId],
    references: [projects.id],
  }),
  user: one(users, { fields: [projectMembers.userId], references: [users.id] }),
}));

export const projectFilesRelations = relations(projectFiles, ({ one }) => ({
  project: one(projects, { fields: [projectFiles.projectId], references: [projects.id] }),
  uploadedBy: one(users, {
    fields: [projectFiles.uploadedByUserId],
    references: [users.id],
  }),
}));

export const projectMessagesRelations = relations(projectMessages, ({ one }) => ({
  project: one(projects, {
    fields: [projectMessages.projectId],
    references: [projects.id],
  }),
}));

export const changeRequestsRelations = relations(changeRequests, ({ one }) => ({
  project: one(projects, {
    fields: [changeRequests.projectId],
    references: [projects.id],
  }),
  order: one(orders, { fields: [changeRequests.orderId], references: [orders.id] }),
}));

export const projectApprovalsRelations = relations(projectApprovals, ({ one }) => ({
  project: one(projects, {
    fields: [projectApprovals.projectId],
    references: [projects.id],
  }),
}));

export const deploymentsRelations = relations(deployments, ({ one }) => ({
  project: one(projects, { fields: [deployments.projectId], references: [projects.id] }),
}));

export type ProjectMember = typeof projectMembers.$inferSelect;
export type ProjectFile = typeof projectFiles.$inferSelect;
export type ProjectMessage = typeof projectMessages.$inferSelect;
export type ChangeRequest = typeof changeRequests.$inferSelect;
export type ProjectApproval = typeof projectApprovals.$inferSelect;
export type Deployment = typeof deployments.$inferSelect;
