import { describe, expect, it } from "vitest";

import { workflowFor } from "@/config/production";
import { RISK_REASON_CODES, RISK_THRESHOLDS, assessRisk, primaryReason } from "./risk";
import { computeSchedule, type TaskProgress } from "./schedule";

/**
 * The risk engine.
 *
 * Two properties are tested above all others, because they are what make it
 * usable rather than merely present:
 *
 *  1. **Deterministic.** Same inputs, same answer, every time. `now` is an
 *     argument, so there is no hidden clock.
 *  2. **Explainable.** A red project always carries a reason saying why. The
 *     level is derived from the reasons, so this is structural -- but it is
 *     asserted anyway, because it is the whole point.
 */

const WORKFLOW = workflowFor("build");
const START = new Date("2026-10-05T09:00:00.000Z");
const DEADLINE = new Date("2026-10-12T09:00:00.000Z");

function tasks(overrides: Partial<TaskProgress>[] = []): TaskProgress[] {
  const base: TaskProgress[] = WORKFLOW.tasks.map((template) => ({
    stage: template.stage,
    status: "ready",
    estimatedMinutes: template.estimatedMinutes,
    actualMinutes: null,
    blockedMinutes: 0,
  }));

  return base.map((task, index) => ({ ...task, ...(overrides[index] ?? {}) }));
}

/** Marks the first `count` tasks done, so progress can be dialled precisely. */
function withDone(count: number, extra: Partial<TaskProgress> = {}): TaskProgress[] {
  return tasks().map((task, index) =>
    index < count ? { ...task, status: "done" as const, ...extra } : task,
  );
}

function schedule(options: {
  now: Date;
  taskList?: TaskProgress[];
  startedAt?: Date | null;
  deadlineAt?: Date | null;
}) {
  return computeSchedule({
    workflow: WORKFLOW,
    startedAt: options.startedAt === undefined ? START : options.startedAt,
    deadlineAt: options.deadlineAt === undefined ? DEADLINE : options.deadlineAt,
    tasks: options.taskList ?? tasks(),
    now: options.now,
  });
}

/* --- Determinism -------------------------------------------------------- */

describe("the engine is deterministic", () => {
  it("returns an identical assessment for identical inputs", () => {
    const now = new Date("2026-10-08T09:00:00.000Z");
    const a = assessRisk({ schedule: schedule({ now }) });
    const b = assessRisk({ schedule: schedule({ now }) });

    expect(a.level).toBe(b.level);
    expect(a.reasons.map((reason) => reason.code)).toEqual(
      b.reasons.map((reason) => reason.code),
    );
  });

  it("carries the ruleset version, as pricing does", () => {
    const assessment = assessRisk({
      schedule: schedule({ now: new Date("2026-10-06T09:00:00.000Z") }),
    });
    expect(assessment.rulesetVersion).toMatch(/^\d{4}\.\d+\.\d+$/);
  });

  it("only ever emits reason codes from the declared union", () => {
    const cases = [
      new Date("2026-10-05T10:00:00.000Z"),
      new Date("2026-10-09T09:00:00.000Z"),
      new Date("2026-10-13T09:00:00.000Z"),
    ];

    for (const now of cases) {
      const assessment = assessRisk({ schedule: schedule({ now }) });
      for (const reason of assessment.reasons) {
        expect(RISK_REASON_CODES, reason.code).toContain(reason.code);
      }
    }
  });
});

/* --- Explainability ----------------------------------------------------- */

describe("the engine always explains itself", () => {
  it("never reports red without a red reason", () => {
    const now = new Date("2026-10-14T09:00:00.000Z"); // past the deadline
    const assessment = assessRisk({ schedule: schedule({ now }) });

    expect(assessment.level).toBe("red");
    expect(assessment.reasons.some((reason) => reason.severity === "red")).toBe(true);
  });

  it("never reports yellow without a yellow reason", () => {
    // A third of the window gone with nothing finished yet.
    const now = new Date("2026-10-07T09:00:00.000Z");
    const assessment = assessRisk({
      schedule: schedule({ now, taskList: withDone(3) }),
    });

    if (assessment.level === "yellow") {
      expect(assessment.reasons.some((reason) => reason.severity === "yellow")).toBe(
        true,
      );
    }
  });

  it("attaches the numbers behind the judgement", () => {
    const now = new Date("2026-10-11T09:00:00.000Z");
    const assessment = assessRisk({ schedule: schedule({ now, taskList: withDone(1) }) });

    const drift = assessment.reasons.find(
      (reason) => reason.code === "behind_schedule" || reason.code === "severely_behind",
    );
    expect(drift?.detail.percentElapsed).toBeTypeOf("number");
    expect(drift?.detail.percentComplete).toBeTypeOf("number");
  });

  it("surfaces the most severe reason first", () => {
    const now = new Date("2026-10-14T09:00:00.000Z");
    const assessment = assessRisk({ schedule: schedule({ now }) });
    expect(primaryReason(assessment)?.severity).toBe("red");
  });
});

/* --- The levels themselves ---------------------------------------------- */

describe("a healthy project", () => {
  it("is green early in the window with work completed", () => {
    const now = new Date("2026-10-06T09:00:00.000Z");
    const assessment = assessRisk({
      schedule: schedule({ now, taskList: withDone(6) }),
    });

    expect(assessment.level).toBe("green");
  });
});

describe("a project that has not started", () => {
  it("is green with a not_started reason rather than a measured verdict", () => {
    // Reporting "on track" for a project with no clock would imply we are
    // measuring something. We are not.
    const assessment = assessRisk({
      schedule: schedule({
        now: new Date("2026-10-06T09:00:00.000Z"),
        startedAt: null,
        deadlineAt: null,
      }),
    });

    expect(assessment.level).toBe("green");
    expect(assessment.reasons.map((r) => r.code)).toEqual(["not_started"]);
  });
});

describe("drift", () => {
  it("turns yellow once elapsed outruns completed by the yellow threshold", () => {
    // Half the window gone, roughly a quarter of the work done.
    const now = new Date("2026-10-08T21:00:00.000Z");
    const result = schedule({ now, taskList: withDone(3) });

    expect(result.drift).toBeGreaterThanOrEqual(RISK_THRESHOLDS.driftYellow);
    const assessment = assessRisk({ schedule: result });
    expect(["yellow", "red"]).toContain(assessment.level);
  });

  it("turns red once drift reaches the red threshold", () => {
    const now = new Date("2026-10-11T09:00:00.000Z");
    const result = schedule({ now, taskList: withDone(1) });

    expect(result.drift).toBeGreaterThanOrEqual(RISK_THRESHOLDS.driftRed);
    expect(assessRisk({ schedule: result }).level).toBe("red");
  });

  it("does not fire once every task is done, however late", () => {
    // Finished is finished. A completed project is not "behind".
    const now = new Date("2026-10-12T08:00:00.000Z");
    const all = tasks().map((task) => ({ ...task, status: "done" as const }));
    const assessment = assessRisk({ schedule: schedule({ now, taskList: all }) });

    expect(assessment.reasons.map((r) => r.code)).not.toContain("severely_behind");
    expect(assessment.reasons.map((r) => r.code)).not.toContain("behind_schedule");
  });
});

describe("blocked work", () => {
  it("raises yellow as soon as anything is blocked", () => {
    const now = new Date("2026-10-06T09:00:00.000Z");
    const blocked = withDone(6).map((task, index) =>
      index === 7 ? { ...task, status: "blocked" as const } : task,
    );

    const assessment = assessRisk({ schedule: schedule({ now, taskList: blocked }) });
    expect(assessment.reasons.map((r) => r.code)).toContain("tasks_blocked");
    expect(assessment.level).not.toBe("green");
  });

  it("counts accumulated blocked time even after unblocking", () => {
    // A project unblocked three times still lost the days.
    const now = new Date("2026-10-06T09:00:00.000Z");
    const healed = withDone(6).map((task, index) =>
      index === 0 ? { ...task, blockedMinutes: RISK_THRESHOLDS.blockedMinutesRed } : task,
    );

    const assessment = assessRisk({ schedule: schedule({ now, taskList: healed }) });
    const reason = assessment.reasons.find((r) => r.code === "blocked_time_significant");
    expect(reason?.severity).toBe("red");
  });
});

describe("a missed deadline", () => {
  it("is red with the overdue count attached", () => {
    const now = new Date("2026-10-15T09:00:00.000Z");
    const assessment = assessRisk({ schedule: schedule({ now }) });

    const missed = assessment.reasons.find((r) => r.code === "deadline_missed");
    expect(missed?.severity).toBe("red");
    expect(missed?.detail.workingDaysOverdue).toBeGreaterThan(0);
  });

  it("is not reported when all the work is finished", () => {
    const now = new Date("2026-10-15T09:00:00.000Z");
    const all = tasks().map((task) => ({ ...task, status: "done" as const }));
    const assessment = assessRisk({ schedule: schedule({ now, taskList: all }) });

    expect(assessment.reasons.map((r) => r.code)).not.toContain("deadline_missed");
  });
});

describe("waiting on the customer", () => {
  it("is recorded as a green reason, not as our delay", () => {
    // The countdown does not run while we wait for a reply, so this must never
    // be the thing that makes a project look late.
    const now = new Date("2026-10-06T09:00:00.000Z");
    const assessment = assessRisk({
      schedule: schedule({ now, taskList: withDone(9) }),
      awaitingCustomer: true,
    });

    const reason = assessment.reasons.find((r) => r.code === "awaiting_customer");
    expect(reason?.severity).toBe("green");
    expect(assessment.level).toBe("green");
  });
});
