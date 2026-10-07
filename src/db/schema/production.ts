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

import {
  deliverableStatusEnum,
  milestoneStatusEnum,
  taskPriorityEnum,
  taskStatusEnum,
  userRoleEnum,
} from "./enums";
import { deployments, projectFiles } from "./workspace";
import { projects } from "./projects";
import { users } from "./users";

/**
 * The production engine's tables.
 *
 * These are the internal plan: what has to happen, in what order, by whom, and
 * how long it took. The customer-facing view is `config/workspace.ts` and the
 * Build Room; nothing here is shown to a customer directly.
 *
 * Everything hangs off `projects`, so a website, an automation and a business
 * product are planned by the same engine with different workflows.
 */

/* -------------------------------------------------------------------------
 * Tasks
 * ---------------------------------------------------------------------- */

export const productionTasks = pgTable(
  "production_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    /** Template key from the workflow, e.g. "build_screens". */
    taskKey: text("task_key").notNull(),
    /** Workflow stage this belongs to. */
    stage: text("stage").notNull(),

    title: text("title").notNull(),
    description: text("description"),

    status: taskStatusEnum("status").notNull().default("pending"),
    priority: taskPriorityEnum("priority").notNull().default("normal"),

    /** Who should do this, by role. Set from the workflow, overridable. */
    responsibleRole: userRoleEnum("responsible_role").notNull(),
    /** Who actually has it. Null means unassigned, which is a real state. */
    assigneeId: uuid("assignee_id").references(() => users.id, {
      onDelete: "set null",
    }),

    /** Planning estimate. Never overwritten by the actual. */
    estimatedMinutes: integer("estimated_minutes").notNull().default(0),
    /** Measured from started/completed, written on completion. */
    actualMinutes: integer("actual_minutes"),
    /**
     * Cumulative time spent blocked. Separate from actual, because a task that
     * took three days of which two were waiting is not a three-day task.
     */
    blockedMinutes: integer("blocked_minutes").notNull().default(0),

    /** Position within its stage, for a stable order in the queue. */
    orderIndex: integer("order_index").notNull().default(0),

    dueAt: timestamp("due_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    blockedAt: timestamp("blocked_at", { withTimezone: true }),
    blockedReason: text("blocked_reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("production_tasks_project_key_key").on(table.projectId, table.taskKey),
    index("production_tasks_project_idx").on(table.projectId, table.orderIndex),
    /** The internal queue filters on these two together. */
    index("production_tasks_status_idx").on(table.status, table.dueAt),
    index("production_tasks_assignee_idx").on(table.assigneeId, table.status),
  ],
);

/**
 * Task dependencies.
 *
 * A separate table rather than an array column, because the question asked
 * most often is the reverse one -- "what is this task blocking?" -- and an
 * array makes that an unindexable scan.
 *
 * Only finish-to-start is modelled. The other three relationships exist in
 * project management theory and have never once been needed to ship a website;
 * adding them before something requires them would be architecture for its own
 * sake.
 */
export const taskDependencies = pgTable(
  "task_dependencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    /** The task that waits. */
    taskId: uuid("task_id")
      .notNull()
      .references(() => productionTasks.id, { onDelete: "cascade" }),
    /** The task it waits for. */
    dependsOnTaskId: uuid("depends_on_task_id")
      .notNull()
      .references(() => productionTasks.id, { onDelete: "cascade" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("task_dependencies_pair_key").on(table.taskId, table.dependsOnTaskId),
    index("task_dependencies_depends_on_idx").on(table.dependsOnTaskId),
    index("task_dependencies_project_idx").on(table.projectId),
  ],
);

/* -------------------------------------------------------------------------
 * Milestones
 * ---------------------------------------------------------------------- */

export const projectMilestones = pgTable(
  "project_milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    milestoneKey: text("milestone_key").notNull(),
    stage: text("stage").notNull(),

    status: milestoneStatusEnum("status").notNull().default("pending"),

    /** Planned date, spread across the guaranteed window by stage weight. */
    targetAt: timestamp("target_at", { withTimezone: true }),
    reachedAt: timestamp("reached_at", { withTimezone: true }),

    orderIndex: integer("order_index").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("project_milestones_project_key_key").on(
      table.projectId,
      table.milestoneKey,
    ),
    index("project_milestones_project_idx").on(table.projectId, table.orderIndex),
  ],
);

/* -------------------------------------------------------------------------
 * Deliverables
 * ---------------------------------------------------------------------- */

/**
 * What the customer actually receives.
 *
 * Points at the thing rather than containing it: a deliverable is a file, a
 * deployment, or a reference to something external. Keeping it separate from
 * both means "has this been delivered and accepted" is one indexed question,
 * not a join across three tables with a guess in the middle.
 */
export const deliverables = pgTable(
  "deliverables",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    deliverableKey: text("deliverable_key").notNull(),
    title: text("title").notNull(),
    stage: text("stage").notNull(),

    status: deliverableStatusEnum("status").notNull().default("pending"),

    fileId: uuid("file_id").references(() => projectFiles.id, { onDelete: "set null" }),
    deploymentId: uuid("deployment_id").references(() => deployments.id, {
      onDelete: "set null",
    }),
    externalUrl: text("external_url"),

    dueAt: timestamp("due_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /* Foreign keys are not indexed automatically. Without these, every
       delete or key update on the referenced table scans this one to check
       the constraint, and every join on the column walks the heap. Cheap to
       hold while the tables are small; an incident to add once they are not. */
    index("deliverables_deployment_id_idx").on(table.deploymentId),
    index("deliverables_file_id_idx").on(table.fileId),

    uniqueIndex("deliverables_project_key_key").on(table.projectId, table.deliverableKey),
    index("deliverables_project_idx").on(table.projectId),
  ],
);

/* -------------------------------------------------------------------------
 * Relations
 * ---------------------------------------------------------------------- */

export const productionTasksRelations = relations(productionTasks, ({ one, many }) => ({
  project: one(projects, {
    fields: [productionTasks.projectId],
    references: [projects.id],
  }),
  assignee: one(users, {
    fields: [productionTasks.assigneeId],
    references: [users.id],
  }),
  dependencies: many(taskDependencies),
}));

export const taskDependenciesRelations = relations(taskDependencies, ({ one }) => ({
  task: one(productionTasks, {
    fields: [taskDependencies.taskId],
    references: [productionTasks.id],
  }),
}));

export const projectMilestonesRelations = relations(projectMilestones, ({ one }) => ({
  project: one(projects, {
    fields: [projectMilestones.projectId],
    references: [projects.id],
  }),
}));

export const deliverablesRelations = relations(deliverables, ({ one }) => ({
  project: one(projects, { fields: [deliverables.projectId], references: [projects.id] }),
}));

export type ProductionTask = typeof productionTasks.$inferSelect;
export type NewProductionTask = typeof productionTasks.$inferInsert;
export type TaskDependency = typeof taskDependencies.$inferSelect;
export type ProjectMilestone = typeof projectMilestones.$inferSelect;
export type Deliverable = typeof deliverables.$inferSelect;
