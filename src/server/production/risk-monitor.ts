import "server-only";

import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";

import { workflowFor } from "@/config/production";
import { db } from "@/db/client";
import { productionTasks, projects, type Project } from "@/db/schema";
import { assessRisk, type RiskAssessment } from "@/lib/production/risk";
import {
  computeSchedule,
  type Schedule,
  type TaskProgress,
} from "@/lib/production/schedule";
import { logger } from "@/lib/logger";
import { emit } from "@/server/events/bus";

/**
 * Evaluating schedule risk.
 *
 * The arithmetic lives in `lib/production`, which is pure and fully tested.
 * This module does the two things that need a database: gather the inputs, and
 * record a change of level.
 *
 * Risk is **recomputed, never accumulated**. The stored `risk_level` on
 * `projects` is a cache for sorting the queue; it is derived entirely from
 * task state and the clock, so it can always be rebuilt and can never drift
 * into saying something the underlying data does not support.
 */

export interface ProjectRisk {
  schedule: Schedule;
  assessment: RiskAssessment;
}

/** Statuses where the project is parked with the customer rather than with us. */
const CUSTOMER_HELD: readonly Project["status"][] = ["in_preview", "awaiting_approval"];

export async function evaluateRisk(
  project: Project,
  now: Date = new Date(),
): Promise<ProjectRisk> {
  const rows = await db
    .select({
      stage: productionTasks.stage,
      status: productionTasks.status,
      estimatedMinutes: productionTasks.estimatedMinutes,
      actualMinutes: productionTasks.actualMinutes,
      blockedMinutes: productionTasks.blockedMinutes,
    })
    .from(productionTasks)
    .where(eq(productionTasks.projectId, project.id));

  const tasks = rows as TaskProgress[];

  const schedule = computeSchedule({
    workflow: workflowFor(project.productType),
    startedAt: project.buildStartedAt,
    deadlineAt: project.deadlineAt,
    tasks,
    now,
  });

  const assessment = assessRisk({
    schedule,
    awaitingCustomer: CUSTOMER_HELD.includes(project.status),
  });

  return { schedule, assessment };
}

/**
 * Evaluates and persists, emitting only when the level actually changes.
 *
 * The emit-on-change rule is what keeps `risk.changed` useful: a project
 * re-evaluated hourly for a fortnight should produce a handful of events, not
 * three hundred identical ones that bury the two that mattered.
 */
export async function refreshRisk(
  project: Project,
  now: Date = new Date(),
): Promise<ProjectRisk> {
  const result = await evaluateRisk(project, now);
  const { assessment } = result;

  if (assessment.level === project.riskLevel) {
    // Still refresh the stored reasons and timestamp: the level can hold
    // steady while the explanation behind it changes.
    await db
      .update(projects)
      .set({ riskReasons: [...assessment.reasons], riskAssessedAt: now })
      .where(eq(projects.id, project.id));
    return result;
  }

  await db
    .update(projects)
    .set({
      riskLevel: assessment.level,
      riskReasons: [...assessment.reasons],
      riskAssessedAt: now,
    })
    .where(eq(projects.id, project.id));

  await emit({
    name: "risk.changed",
    projectId: project.id,
    actorType: "system",
    payload: {
      from: project.riskLevel,
      to: assessment.level,
      reasons: assessment.reasons.map((reason) => reason.code),
      rulesetVersion: assessment.rulesetVersion,
    },
  });

  logger.info("project risk changed", {
    projectId: project.id,
    from: project.riskLevel,
    to: assessment.level,
    reasons: assessment.reasons.map((reason) => reason.code),
  });

  return result;
}

/**
 * Sweeps every live project.
 *
 * Intended for a scheduled run. Deliberately scoped to projects that have
 * actually started and have not finished -- risk is meaningless before the
 * clock runs and irrelevant after launch, and scanning them would make the
 * sweep grow forever.
 */
export async function sweepOpenProjects(now: Date = new Date()): Promise<{
  evaluated: number;
  byLevel: Record<string, number>;
}> {
  const open = await db
    .select()
    .from(projects)
    .where(
      and(
        isNotNull(projects.buildStartedAt),
        ne(projects.status, "cancelled"),
        inArray(projects.status, ["in_build", "in_preview", "awaiting_approval"]),
      ),
    );

  const byLevel: Record<string, number> = { green: 0, yellow: 0, red: 0 };

  for (const project of open) {
    try {
      const { assessment } = await refreshRisk(project, now);
      byLevel[assessment.level] = (byLevel[assessment.level] ?? 0) + 1;
    } catch (error) {
      // One bad project must not stop the sweep; the rest still need checking.
      logger.error("risk sweep failed for a project", {
        projectId: project.id,
        error,
      });
    }
  }

  return { evaluated: open.length, byLevel };
}

/**
 * Records a missed deadline exactly once.
 *
 * Separate from risk because the consequences differ in kind: `red` is a
 * warning for the queue, a missed deadline is a refund the customer is owed.
 * Emitting it more than once would mean a refund conversation reopening every
 * time the sweep runs.
 */
export async function detectMissedDeadline(
  project: Project,
  now: Date = new Date(),
): Promise<boolean> {
  if (!project.deadlineAt) return false;
  if (now.getTime() <= project.deadlineAt.getTime()) return false;
  if (!["in_build", "in_preview"].includes(project.status)) return false;

  const already = await db.query.projectEvents.findFirst({
    where: (events, { and: andFn, eq: eqFn }) =>
      andFn(eqFn(events.projectId, project.id), eqFn(events.type, "deadline.missed")),
  });
  if (already) return false;

  const overdueMs = now.getTime() - project.deadlineAt.getTime();

  await emit({
    name: "deadline.missed",
    projectId: project.id,
    actorType: "system",
    payload: {
      deadlineAt: project.deadlineAt.toISOString(),
      detectedAt: now.toISOString(),
      workingDaysOverdue: Math.max(1, Math.ceil(overdueMs / 86_400_000)),
    },
  });

  logger.warn("deadline missed", {
    projectId: project.id,
    reference: project.reference,
    deadlineAt: project.deadlineAt.toISOString(),
  });

  return true;
}
