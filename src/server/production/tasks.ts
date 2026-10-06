import "server-only";

import { and, eq, inArray, notInArray } from "drizzle-orm";

import { db } from "@/db/client";
import {
  productionTasks,
  projectMilestones,
  taskDependencies,
  type ProductionTask,
} from "@/db/schema";
import { ApiError } from "@/lib/api/response";
import { logger } from "@/lib/logger";
import type { AuthContext } from "@/server/auth";
import { emit } from "@/server/events/bus";

/**
 * Task operations.
 *
 * All of these are staff work, gated on `build:execute`. A customer has no
 * route to a production task at all -- the Build Room shows them stages and
 * deadlines, not the internal plan -- so the check here is the only one
 * needed, and it answers `not_found` rather than `forbidden`.
 *
 * Durations are measured, never typed in. `actualMinutes` comes from the gap
 * between `startedAt` and `completedAt` minus time spent blocked, so a task
 * that took three days of which two were waiting is recorded as a one-day
 * task. Letting someone enter an actual by hand would make the estimates it is
 * supposed to calibrate worthless.
 */

const MINUTE = 60_000;

function requireBuildAccess(context: AuthContext): void {
  if (!context.can("build:execute")) {
    throw new ApiError("not_found", "Not found.");
  }
}

async function loadTask(taskId: string): Promise<ProductionTask> {
  const task = await db.query.productionTasks.findFirst({
    where: eq(productionTasks.id, taskId),
  });
  if (!task) throw new ApiError("not_found", "Not found.");
  return task;
}

/* -------------------------------------------------------------------------
 * Dependencies
 * ---------------------------------------------------------------------- */

/**
 * Promotes tasks whose dependencies are now all satisfied.
 *
 * Called after a completion. Written as a set operation rather than a loop
 * over dependents, because the question "which pending tasks have no
 * unfinished dependency" is one query and a loop would be N.
 */
export async function refreshReadiness(projectId: string): Promise<string[]> {
  const pending = await db
    .select({ id: productionTasks.id })
    .from(productionTasks)
    .where(
      and(
        eq(productionTasks.projectId, projectId),
        eq(productionTasks.status, "pending"),
      ),
    );

  if (pending.length === 0) return [];

  const pendingIds = pending.map((row) => row.id);

  // Dependencies of those tasks that are not yet done.
  const unmet = await db
    .select({ taskId: taskDependencies.taskId })
    .from(taskDependencies)
    .innerJoin(productionTasks, eq(productionTasks.id, taskDependencies.dependsOnTaskId))
    .where(
      and(
        inArray(taskDependencies.taskId, pendingIds),
        notInArray(productionTasks.status, ["done", "cancelled"]),
      ),
    );

  const blockedIds = new Set(unmet.map((row) => row.taskId));
  const readyIds = pendingIds.filter((id) => !blockedIds.has(id));

  if (readyIds.length === 0) return [];

  await db
    .update(productionTasks)
    .set({ status: "ready", updatedAt: new Date() })
    .where(inArray(productionTasks.id, readyIds));

  return readyIds;
}

/* -------------------------------------------------------------------------
 * Operations
 * ---------------------------------------------------------------------- */

export async function assignTask(
  taskId: string,
  assigneeId: string | null,
  context: AuthContext,
): Promise<ProductionTask> {
  requireBuildAccess(context);
  const task = await loadTask(taskId);

  const [updated] = await db
    .update(productionTasks)
    .set({ assigneeId, updatedAt: new Date() })
    .where(eq(productionTasks.id, taskId))
    .returning();

  if (!updated) throw new Error("Task update returned no row.");

  await emit({
    name: "task.assigned",
    projectId: task.projectId,
    actorType: "staff",
    actorId: context.user.clerkUserId,
    payload: { taskId, taskKey: task.taskKey, assigneeId },
  });

  return updated;
}

export async function startTask(
  taskId: string,
  context: AuthContext,
): Promise<ProductionTask> {
  requireBuildAccess(context);
  const task = await loadTask(taskId);

  // A pending task has an unfinished dependency. Starting it anyway would make
  // the dependency graph decorative.
  if (task.status === "pending") {
    throw new ApiError("conflict", "This task is waiting on another task.");
  }
  if (task.status === "done" || task.status === "cancelled") {
    throw new ApiError("conflict", "This task is already finished.");
  }

  const now = new Date();
  const [updated] = await db
    .update(productionTasks)
    .set({
      status: "in_progress",
      // Preserved across a block and resume, so the measured duration spans
      // the whole piece of work rather than restarting.
      startedAt: task.startedAt ?? now,
      blockedAt: null,
      updatedAt: now,
    })
    .where(eq(productionTasks.id, taskId))
    .returning();

  if (!updated) throw new Error("Task update returned no row.");

  await emit({
    name: "task.started",
    projectId: task.projectId,
    actorType: "staff",
    actorId: context.user.clerkUserId,
    payload: { taskId, taskKey: task.taskKey },
  });

  return updated;
}

export async function blockTask(
  taskId: string,
  reason: string,
  context: AuthContext,
): Promise<ProductionTask> {
  requireBuildAccess(context);
  const task = await loadTask(taskId);

  const trimmed = reason.trim();
  // A blocked task with no reason is a task nobody can unblock.
  if (trimmed === "") {
    throw new ApiError("bad_request", "Say what the task is blocked on.");
  }

  const now = new Date();
  const [updated] = await db
    .update(productionTasks)
    .set({
      status: "blocked",
      blockedAt: now,
      blockedReason: trimmed.slice(0, 500),
      updatedAt: now,
    })
    .where(eq(productionTasks.id, taskId))
    .returning();

  if (!updated) throw new Error("Task update returned no row.");

  await emit({
    name: "task.blocked",
    projectId: task.projectId,
    actorType: "staff",
    actorId: context.user.clerkUserId,
    payload: { taskId, taskKey: task.taskKey, reason: trimmed.slice(0, 500) },
  });

  logger.info("task blocked", { taskId, projectId: task.projectId });
  return updated;
}

export async function unblockTask(
  taskId: string,
  context: AuthContext,
): Promise<ProductionTask> {
  requireBuildAccess(context);
  const task = await loadTask(taskId);

  if (task.status !== "blocked") {
    throw new ApiError("conflict", "This task is not blocked.");
  }

  const now = new Date();
  // Accumulated, not replaced: a task blocked three times has lost all three
  // periods, and the risk engine needs the total.
  const thisSpell = task.blockedAt
    ? Math.round((now.getTime() - task.blockedAt.getTime()) / MINUTE)
    : 0;
  const blockedMinutes = task.blockedMinutes + thisSpell;

  const [updated] = await db
    .update(productionTasks)
    .set({
      status: task.startedAt ? "in_progress" : "ready",
      blockedAt: null,
      blockedReason: null,
      blockedMinutes,
      updatedAt: now,
    })
    .where(eq(productionTasks.id, taskId))
    .returning();

  if (!updated) throw new Error("Task update returned no row.");

  await emit({
    name: "task.unblocked",
    projectId: task.projectId,
    actorType: "staff",
    actorId: context.user.clerkUserId,
    payload: { taskId, taskKey: task.taskKey, blockedMinutes },
  });

  return updated;
}

export async function completeTask(
  taskId: string,
  context: AuthContext,
): Promise<{ task: ProductionTask; unlocked: string[] }> {
  requireBuildAccess(context);
  const task = await loadTask(taskId);

  if (task.status === "done") {
    return { task, unlocked: [] };
  }
  if (task.status === "cancelled") {
    throw new ApiError("conflict", "This task was cancelled.");
  }

  const now = new Date();

  // Measured, never entered. Blocked time is deducted so an estimate is
  // calibrated against work, not against waiting.
  const spanMinutes = task.startedAt
    ? Math.round((now.getTime() - task.startedAt.getTime()) / MINUTE)
    : 0;
  const actualMinutes = Math.max(0, spanMinutes - task.blockedMinutes);

  const [updated] = await db
    .update(productionTasks)
    .set({
      status: "done",
      completedAt: now,
      actualMinutes: task.startedAt ? actualMinutes : null,
      blockedAt: null,
      updatedAt: now,
    })
    .where(eq(productionTasks.id, taskId))
    .returning();

  if (!updated) throw new Error("Task update returned no row.");

  await emit({
    name: "task.completed",
    projectId: task.projectId,
    actorType: "staff",
    actorId: context.user.clerkUserId,
    payload: {
      taskId,
      taskKey: task.taskKey,
      estimatedMinutes: task.estimatedMinutes,
      actualMinutes: updated.actualMinutes,
    },
  });

  const unlocked = await refreshReadiness(task.projectId);
  await reachMilestonesForStage(task.projectId, task.stage, context);

  return { task: updated, unlocked };
}

/* -------------------------------------------------------------------------
 * Milestones
 * ---------------------------------------------------------------------- */

/**
 * Marks a stage's milestone reached once every task in that stage is done.
 *
 * Derived from task state rather than set by hand, so a milestone cannot claim
 * a stage is complete while work in it is still open.
 */
export async function reachMilestonesForStage(
  projectId: string,
  stage: string,
  context: AuthContext,
): Promise<string[]> {
  const stageTasks = await db
    .select({ status: productionTasks.status })
    .from(productionTasks)
    .where(
      and(eq(productionTasks.projectId, projectId), eq(productionTasks.stage, stage)),
    );

  const outstanding = stageTasks.filter(
    (task) => task.status !== "done" && task.status !== "cancelled",
  );
  if (outstanding.length > 0) return [];

  const pending = await db
    .select({ id: projectMilestones.id, key: projectMilestones.milestoneKey })
    .from(projectMilestones)
    .where(
      and(
        eq(projectMilestones.projectId, projectId),
        eq(projectMilestones.stage, stage),
        eq(projectMilestones.status, "pending"),
      ),
    );

  const now = new Date();
  const reached: string[] = [];

  for (const milestone of pending) {
    const [updated] = await db
      .update(projectMilestones)
      .set({ status: "reached", reachedAt: now })
      // Conditional on it still being pending, so two concurrent completions
      // emit one milestone event rather than two.
      .where(
        and(
          eq(projectMilestones.id, milestone.id),
          eq(projectMilestones.status, "pending"),
        ),
      )
      .returning({ id: projectMilestones.id });

    if (!updated) continue;

    reached.push(milestone.id);
    await emit({
      name: "milestone.reached",
      projectId,
      actorType: "system",
      actorId: context.user.clerkUserId,
      payload: { milestoneId: milestone.id, milestoneKey: milestone.key },
    });
  }

  return reached;
}
