import {
  chargeableWeight,
  stageIndex,
  type ProductionStageId,
  type ProductionWorkflow,
} from "@/config/production";
import { addWorkingDays, workingDaysBetween } from "@/lib/schedule/deadline";

/**
 * Schedule arithmetic.
 *
 * Pure: no database, no clock of its own, no provider. `now` is always an
 * argument, which is what makes every one of these numbers reproducible in a
 * test and identical on two servers in different regions.
 *
 * Nothing here predicts anything. Expected completion is a linear
 * extrapolation from observed progress, stated as such, and the seam for a
 * real forecaster is `ScheduleForecaster` at the bottom of this file.
 */

export interface TaskProgress {
  stage: ProductionStageId;
  status:
    "pending" | "ready" | "in_progress" | "blocked" | "in_review" | "done" | "cancelled";
  estimatedMinutes: number;
  actualMinutes: number | null;
  /** Total time this task has spent blocked, in minutes. */
  blockedMinutes: number;
}

export interface ScheduleInput {
  workflow: ProductionWorkflow;
  /** When the build officially started. Null before the clock runs. */
  startedAt: Date | null;
  /** The stored deadline. Null when there is no guarantee. */
  deadlineAt: Date | null;
  tasks: readonly TaskProgress[];
  now: Date;
}

export interface Schedule {
  /** Null until the build has started. */
  startedAt: Date | null;
  deadlineAt: Date | null;

  /** Working days from now to the deadline; negative once it has passed. */
  workingDaysRemaining: number | null;
  /** Fraction of the guaranteed window used, 0 to 1 (uncapped above 1). */
  percentElapsed: number | null;
  /** Fraction of planned work completed, by weight, 0 to 1. */
  percentComplete: number;

  /** How far behind the plan we are. Positive means behind. */
  drift: number | null;

  /** Minutes lost to blocked tasks across the whole project. */
  blockedMinutes: number;

  /**
   * Linear extrapolation of when work will finish at the observed rate.
   * Null until there is enough progress to extrapolate from.
   */
  expectedCompletionAt: Date | null;

  counts: {
    total: number;
    done: number;
    inProgress: number;
    blocked: number;
    remaining: number;
  };
}

/** Weight of a task, derived from its stage's share of the workflow. */
function weightOf(workflow: ProductionWorkflow, task: TaskProgress): number {
  const stage = workflow.stages.find((entry) => entry.id === task.stage);
  if (!stage) return 0;

  const peers = workflow.tasks.filter((entry) => entry.stage === task.stage).length;
  // A stage's weight is shared evenly among its tasks. Crude on purpose:
  // pretending to know that one task is 61% of design would be invention.
  return peers > 0 ? stage.weight / peers : stage.weight;
}

export function computeSchedule(input: ScheduleInput): Schedule {
  const { workflow, startedAt, deadlineAt, tasks, now } = input;

  const active = tasks.filter((task) => task.status !== "cancelled");

  const totalWeight = active.reduce((sum, task) => sum + weightOf(workflow, task), 0);
  const doneWeight = active
    .filter((task) => task.status === "done")
    .reduce((sum, task) => sum + weightOf(workflow, task), 0);

  const percentComplete = totalWeight > 0 ? doneWeight / totalWeight : 0;

  const blockedMinutes = active.reduce((sum, task) => sum + task.blockedMinutes, 0);

  const counts = {
    total: active.length,
    done: active.filter((task) => task.status === "done").length,
    inProgress: active.filter((task) => task.status === "in_progress").length,
    blocked: active.filter((task) => task.status === "blocked").length,
    remaining: active.filter((task) => task.status !== "done").length,
  };

  // Nothing below this line is meaningful before the clock starts, and
  // returning zeroes would read as "0% elapsed, on track" for a project that
  // has not begun.
  if (!startedAt || !deadlineAt) {
    return {
      startedAt,
      deadlineAt,
      workingDaysRemaining: null,
      percentElapsed: null,
      percentComplete,
      drift: null,
      blockedMinutes,
      expectedCompletionAt: null,
      counts,
    };
  }

  const totalWindow = deadlineAt.getTime() - startedAt.getTime();
  const elapsed = now.getTime() - startedAt.getTime();
  const percentElapsed = totalWindow > 0 ? Math.max(0, elapsed / totalWindow) : 0;

  const drift = percentElapsed - percentComplete;

  // Linear extrapolation, and nothing more. If a quarter of the work took a
  // day, the whole is projected at four days. Honest about its own naivety.
  const expectedCompletionAt =
    percentComplete > 0.05 && elapsed > 0
      ? new Date(startedAt.getTime() + elapsed / percentComplete)
      : null;

  return {
    startedAt,
    deadlineAt,
    workingDaysRemaining: workingDaysBetween(now, deadlineAt),
    percentElapsed,
    percentComplete,
    drift,
    blockedMinutes,
    expectedCompletionAt,
    counts,
  };
}

/**
 * Target dates for each stage, spread across the guaranteed window by weight.
 *
 * Customer-facing stages are excluded from the chargeable total, so a project
 * is not expected to have spent its own time waiting for a reply.
 */
export function stageTargets(
  workflow: ProductionWorkflow,
  startedAt: Date,
  guaranteedDays: number,
): { stage: ProductionStageId; targetAt: Date }[] {
  const chargeable = chargeableWeight(workflow);
  if (chargeable <= 0) return [];

  let cumulative = 0;
  return workflow.stages.map((stage) => {
    if (!stage.awaitsCustomer) cumulative += stage.weight;
    const share = cumulative / chargeable;
    return {
      stage: stage.id,
      targetAt: addWorkingDays(startedAt, Math.ceil(guaranteedDays * share)),
    };
  });
}

/** The stage a project should be in by now, given elapsed time. */
export function expectedStage(
  workflow: ProductionWorkflow,
  percentElapsed: number,
): ProductionStageId | null {
  const chargeable = chargeableWeight(workflow);
  if (chargeable <= 0) return null;

  let cumulative = 0;
  for (const stage of workflow.stages) {
    if (stage.awaitsCustomer) continue;
    cumulative += stage.weight;
    if (percentElapsed <= cumulative / chargeable) return stage.id;
  }
  return workflow.stages.at(-1)?.id ?? null;
}

/** True when the furthest-started stage is behind where it should be. */
export function isBehindStage(
  workflow: ProductionWorkflow,
  currentStage: ProductionStageId | null,
  percentElapsed: number,
): boolean {
  const expected = expectedStage(workflow, percentElapsed);
  if (!expected || !currentStage) return false;
  return stageIndex(workflow, currentStage) < stageIndex(workflow, expected);
}

/**
 * The seam for a real forecaster.
 *
 * `computeSchedule` is deterministic arithmetic and is deliberately described
 * as such everywhere it surfaces. When there is enough delivery history to
 * learn from, an implementation of this interface replaces the extrapolation
 * without any caller changing -- exactly as `ScopeAssessor` does for pricing.
 *
 * Until then there is no forecaster, and nothing in the product claims there
 * is one.
 */
export interface ScheduleForecaster {
  readonly id: string;
  readonly version: string;
  forecast(input: ScheduleInput): Promise<{
    expectedCompletionAt: Date | null;
    confidence: number | null;
  }>;
}
