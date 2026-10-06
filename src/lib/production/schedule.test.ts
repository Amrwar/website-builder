import { describe, expect, it } from "vitest";

import { chargeableWeight, workflowFor } from "@/config/production";
import { PRODUCT_TYPES } from "@/db/schema/enums";
import {
  computeSchedule,
  expectedStage,
  isBehindStage,
  stageTargets,
  type TaskProgress,
} from "./schedule";

const WORKFLOW = workflowFor("build");
const START = new Date("2026-10-05T09:00:00.000Z");
const DEADLINE = new Date("2026-10-12T09:00:00.000Z");

function taskList(done = 0): TaskProgress[] {
  return WORKFLOW.tasks.map((template, index) => ({
    stage: template.stage,
    status: index < done ? "done" : "ready",
    estimatedMinutes: template.estimatedMinutes,
    actualMinutes: null,
    blockedMinutes: 0,
  }));
}

function run(now: Date, tasks = taskList(), startedAt: Date | null = START) {
  return computeSchedule({
    workflow: WORKFLOW,
    startedAt,
    deadlineAt: startedAt ? DEADLINE : null,
    tasks,
    now,
  });
}

/* --- Workflow sanity ---------------------------------------------------- */

describe("every workflow is internally consistent", () => {
  it("has stage weights summing to 1", () => {
    // A workflow summing to 0.8 would report every project as ahead of plan.
    for (const productType of PRODUCT_TYPES) {
      const total = workflowFor(productType).stages.reduce(
        (sum, stage) => sum + stage.weight,
        0,
      );
      expect(total, productType).toBeCloseTo(1, 5);
    }
  });

  it("only places tasks in stages the workflow declares", () => {
    for (const productType of PRODUCT_TYPES) {
      const workflow = workflowFor(productType);
      const stageIds = new Set(workflow.stages.map((stage) => stage.id));
      for (const task of workflow.tasks) {
        expect(stageIds.has(task.stage), `${productType}/${task.key}`).toBe(true);
      }
    }
  });

  it("only declares dependencies on tasks in the same workflow", () => {
    // A dangling dependency key would silently drop at plan time, leaving a
    // task startable that should have waited.
    for (const productType of PRODUCT_TYPES) {
      const workflow = workflowFor(productType);
      const keys = new Set(workflow.tasks.map((task) => task.key));
      for (const task of workflow.tasks) {
        for (const dependency of task.dependsOn ?? []) {
          expect(
            keys.has(dependency),
            `${productType}/${task.key} -> ${dependency}`,
          ).toBe(true);
        }
      }
    }
  });

  it("has no task depending on itself", () => {
    for (const productType of PRODUCT_TYPES) {
      for (const task of workflowFor(productType).tasks) {
        expect(task.dependsOn ?? [], task.key).not.toContain(task.key);
      }
    }
  });

  it("has no circular dependencies", () => {
    // A cycle would leave every task in it permanently pending.
    for (const productType of PRODUCT_TYPES) {
      const workflow = workflowFor(productType);
      const edges = new Map(
        workflow.tasks.map((task) => [task.key, task.dependsOn ?? []]),
      );

      const state = new Map<string, "visiting" | "done">();
      const walk = (key: string): boolean => {
        const seen = state.get(key);
        if (seen === "done") return false;
        if (seen === "visiting") return true;
        state.set(key, "visiting");
        for (const next of edges.get(key) ?? []) {
          if (walk(next)) return true;
        }
        state.set(key, "done");
        return false;
      };

      for (const key of edges.keys()) {
        expect(walk(key), `${productType} cycle at ${key}`).toBe(false);
      }
    }
  });

  it("places every milestone in a declared stage", () => {
    for (const productType of PRODUCT_TYPES) {
      const workflow = workflowFor(productType);
      const stageIds = new Set(workflow.stages.map((stage) => stage.id));
      for (const milestone of workflow.milestones) {
        expect(stageIds.has(milestone.stage), milestone.key).toBe(true);
      }
    }
  });

  it("excludes customer-facing stages from the chargeable window", () => {
    // We do not count our own clock against time spent waiting for a reply.
    for (const productType of PRODUCT_TYPES) {
      const workflow = workflowFor(productType);
      const chargeable = chargeableWeight(workflow);
      expect(chargeable, productType).toBeLessThan(1);
      expect(chargeable, productType).toBeGreaterThan(0);
    }
  });
});

/* --- Schedule arithmetic ------------------------------------------------ */

describe("before the clock starts", () => {
  it("reports no elapsed, no drift and no expectation", () => {
    // Zeroes would read as "0% elapsed, on track" for something not begun.
    const result = run(new Date("2026-10-06T09:00:00.000Z"), taskList(), null);

    expect(result.percentElapsed).toBeNull();
    expect(result.drift).toBeNull();
    expect(result.expectedCompletionAt).toBeNull();
    expect(result.workingDaysRemaining).toBeNull();
  });

  it("still counts completed work", () => {
    const result = run(new Date("2026-10-06T09:00:00.000Z"), taskList(3), null);
    expect(result.percentComplete).toBeGreaterThan(0);
  });
});

describe("elapsed and complete", () => {
  it("reports half the window elapsed at the midpoint", () => {
    const result = run(new Date("2026-10-08T21:00:00.000Z"));
    expect(result.percentElapsed).toBeCloseTo(0.5, 2);
  });

  it("reports nothing complete when nothing is done", () => {
    expect(run(new Date("2026-10-06T09:00:00.000Z")).percentComplete).toBe(0);
  });

  it("reports everything complete when every task is done", () => {
    const all = taskList().map((task) => ({ ...task, status: "done" as const }));
    expect(run(new Date("2026-10-06T09:00:00.000Z"), all).percentComplete).toBeCloseTo(
      1,
      5,
    );
  });

  it("ignores cancelled tasks on both sides of the ratio", () => {
    const withCancelled = taskList().map((task, index) =>
      index === 0 ? { ...task, status: "cancelled" as const } : task,
    );
    const result = run(new Date("2026-10-06T09:00:00.000Z"), withCancelled);
    expect(result.counts.total).toBe(taskList().length - 1);
  });

  it("computes drift as elapsed minus complete", () => {
    const result = run(new Date("2026-10-08T21:00:00.000Z"), taskList(2));
    expect(result.drift).toBeCloseTo(
      (result.percentElapsed ?? 0) - result.percentComplete,
      5,
    );
  });
});

describe("blocked time", () => {
  it("sums across every task", () => {
    const blocked = taskList().map((task, index) =>
      index < 3 ? { ...task, blockedMinutes: 60 } : task,
    );
    expect(run(new Date("2026-10-06T09:00:00.000Z"), blocked).blockedMinutes).toBe(180);
  });
});

describe("expected completion", () => {
  it("extrapolates linearly from observed progress", () => {
    // A quarter done after a day projects four days. Naive, deterministic,
    // and described as such -- there is no forecaster in the product.
    const now = new Date("2026-10-06T09:00:00.000Z");
    const result = run(now, taskList(7));

    expect(result.expectedCompletionAt).not.toBeNull();
    expect(result.expectedCompletionAt!.getTime()).toBeGreaterThan(START.getTime());
  });

  it("declines to extrapolate from almost no progress", () => {
    // One task in is not a rate.
    const result = run(new Date("2026-10-05T09:30:00.000Z"), taskList(0));
    expect(result.expectedCompletionAt).toBeNull();
  });
});

describe("counts", () => {
  it("separates done, in progress, blocked and remaining", () => {
    const mixed = taskList(2).map((task, index) => {
      if (index === 2) return { ...task, status: "in_progress" as const };
      if (index === 3) return { ...task, status: "blocked" as const };
      return task;
    });

    const counts = run(new Date("2026-10-06T09:00:00.000Z"), mixed).counts;
    expect(counts.done).toBe(2);
    expect(counts.inProgress).toBe(1);
    expect(counts.blocked).toBe(1);
    expect(counts.remaining).toBe(counts.total - 2);
  });
});

/* --- Stage targets ------------------------------------------------------ */

describe("stage targets", () => {
  it("gives every stage a target inside or at the window", () => {
    const targets = stageTargets(WORKFLOW, START, 5);
    expect(targets).toHaveLength(WORKFLOW.stages.length);
    for (const target of targets) {
      expect(target.targetAt.getTime()).toBeGreaterThanOrEqual(START.getTime());
    }
  });

  it("orders targets monotonically through the workflow", () => {
    const targets = stageTargets(WORKFLOW, START, 10);
    for (let i = 1; i < targets.length; i += 1) {
      expect(targets[i]!.targetAt.getTime()).toBeGreaterThanOrEqual(
        targets[i - 1]!.targetAt.getTime(),
      );
    }
  });

  it("names the stage a project should be in by now", () => {
    expect(expectedStage(WORKFLOW, 0)).toBe("brief");
    expect(expectedStage(WORKFLOW, 1)).toBe("launch");
  });

  it("detects a project sitting behind where it should be", () => {
    // 80% of the window gone and still in design.
    expect(isBehindStage(WORKFLOW, "design", 0.8)).toBe(true);
    expect(isBehindStage(WORKFLOW, "deployment", 0.3)).toBe(false);
  });
});
