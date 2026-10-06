import "server-only";

import { eq } from "drizzle-orm";

import { stageTargets } from "@/lib/production/schedule";
import { workflowFor, type ProductionWorkflow } from "@/config/production";
import { db } from "@/db/client";
import {
  productionTasks,
  projectMilestones,
  taskDependencies,
  type Project,
} from "@/db/schema";
import { emit } from "@/server/events/bus";
import { logger } from "@/lib/logger";

/**
 * Turning a workflow into a concrete plan.
 *
 * Called once, when a build officially starts. The workflow is a template; the
 * plan is the instance -- real rows with real dates that people are assigned
 * to and that the risk engine measures against.
 *
 * Idempotent by construction: `(project_id, task_key)` and
 * `(project_id, milestone_key)` are unique, so a second call inserts nothing
 * rather than doubling the plan. That matters because plan creation hangs off
 * a lifecycle transition that is itself retryable.
 */

export interface PlanResult {
  workflowId: string;
  taskCount: number;
  milestoneCount: number;
  created: boolean;
}

/** Tasks whose dependencies are already satisfied can be picked up at once. */
function initialStatus(hasDependencies: boolean): "pending" | "ready" {
  return hasDependencies ? "pending" : "ready";
}

export async function createProductionPlan(project: Project): Promise<PlanResult> {
  const workflow: ProductionWorkflow = workflowFor(project.productType);

  const existing = await db
    .select({ id: productionTasks.id })
    .from(productionTasks)
    .where(eq(productionTasks.projectId, project.id))
    .limit(1);

  if (existing.length > 0) {
    return {
      workflowId: workflow.id,
      taskCount: 0,
      milestoneCount: 0,
      created: false,
    };
  }

  const startedAt = project.buildStartedAt ?? new Date();
  const targets = project.guaranteedDays
    ? stageTargets(workflow, startedAt, project.guaranteedDays)
    : [];
  const targetByStage = new Map(targets.map((entry) => [entry.stage, entry.targetAt]));

  const result = await db.transaction(async (tx) => {
    const taskRows = workflow.tasks.map((template, index) => {
      const stage = workflow.stages.find((entry) => entry.id === template.stage);
      return {
        projectId: project.id,
        taskKey: template.key,
        stage: template.stage,
        // The title is the key until someone edits it. Inventing prose here
        // would be copy nobody wrote and nobody can translate.
        title: template.key.replace(/_/g, " "),
        status: initialStatus((template.dependsOn?.length ?? 0) > 0),
        priority: template.priority ?? "normal",
        responsibleRole:
          template.responsibleRole ?? stage?.responsibleRole ?? "project_manager",
        estimatedMinutes: template.estimatedMinutes,
        orderIndex: index,
        dueAt: targetByStage.get(template.stage) ?? null,
      };
    });

    const inserted = await tx.insert(productionTasks).values(taskRows).returning({
      id: productionTasks.id,
      taskKey: productionTasks.taskKey,
    });

    const idByKey = new Map(inserted.map((row) => [row.taskKey, row.id]));

    const dependencyRows = workflow.tasks.flatMap((template) =>
      (template.dependsOn ?? []).flatMap((dependencyKey) => {
        const taskId = idByKey.get(template.key);
        const dependsOnTaskId = idByKey.get(dependencyKey);
        // A template referring to a task that is not in this workflow is a
        // configuration error, not a runtime one -- it is caught by a test.
        if (!taskId || !dependsOnTaskId || taskId === dependsOnTaskId) return [];
        return [{ projectId: project.id, taskId, dependsOnTaskId }];
      }),
    );

    if (dependencyRows.length > 0) {
      await tx.insert(taskDependencies).values(dependencyRows);
    }

    const milestoneRows = workflow.milestones.map((milestone, index) => ({
      projectId: project.id,
      milestoneKey: milestone.key,
      stage: milestone.stage,
      targetAt: targetByStage.get(milestone.stage) ?? null,
      orderIndex: index,
    }));

    if (milestoneRows.length > 0) {
      await tx.insert(projectMilestones).values(milestoneRows);
    }

    return { tasks: taskRows.length, milestones: milestoneRows.length };
  });

  await emit({
    name: "plan.created",
    projectId: project.id,
    actorType: "system",
    payload: {
      workflowId: workflow.id,
      taskCount: result.tasks,
      milestoneCount: result.milestones,
    },
  });

  logger.info("production plan created", {
    projectId: project.id,
    workflowId: workflow.id,
    tasks: result.tasks,
  });

  return {
    workflowId: workflow.id,
    taskCount: result.tasks,
    milestoneCount: result.milestones,
    created: true,
  };
}
