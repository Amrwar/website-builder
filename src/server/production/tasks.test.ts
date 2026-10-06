import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Task operations.
 *
 * The interesting behaviour is not "can a row be updated" but the three things
 * that make the engine trustworthy: a dependency actually prevents a start,
 * blocked time accumulates rather than resets, and durations are measured
 * rather than entered.
 */

const updates: { table: string; values: Record<string, unknown> }[] = [];
const emitted: { name: string; payload: Record<string, unknown> }[] = [];

let taskRow: Record<string, unknown> | undefined;
let stageTasks: { status: string }[] = [];
let pendingTasks: { id: string }[] = [];
let unmetDependencies: { taskId: string }[] = [];
let pendingMilestones: { id: string; key: string }[] = [];
let updateMatches = true;

function tableName(table: unknown): string {
  for (const symbol of Object.getOwnPropertySymbols(table as object)) {
    if (String(symbol).includes("Name")) {
      return String((table as Record<symbol, unknown>)[symbol]);
    }
  }
  return "unknown";
}

/** Returns a different shape per call site, keyed by what the caller selects. */
function selectResult(fields: Record<string, unknown> | undefined): unknown[] {
  const keys = Object.keys(fields ?? {});
  if (keys.includes("taskId")) return unmetDependencies;
  if (keys.includes("milestoneKey") || keys.includes("key")) return pendingMilestones;
  if (keys.length === 1 && keys[0] === "id") return pendingTasks;
  if (keys.includes("status")) return stageTasks;
  return [];
}

vi.mock("@/db/client", () => ({
  db: {
    query: { productionTasks: { findFirst: () => Promise.resolve(taskRow) } },
    select: (fields?: Record<string, unknown>) => {
      const rows = selectResult(fields);
      const chain = {
        from: () => chain,
        innerJoin: () => chain,
        where: () => Promise.resolve(rows),
      };
      return chain;
    },
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        updates.push({ table: tableName(table), values });
        return {
          where: () => ({
            then: (resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve),
            returning: () =>
              Promise.resolve(
                updateMatches ? [{ ...(taskRow ?? {}), ...values, id: "task-1" }] : [],
              ),
          }),
        };
      },
    }),
  },
}));

vi.mock("@/server/events/bus", () => ({
  emit: (options: { name: string; payload: Record<string, unknown> }) => {
    emitted.push({ name: options.name, payload: options.payload });
    return Promise.resolve(options);
  },
}));

const { assignTask, blockTask, completeTask, startTask, unblockTask } =
  await import("./tasks");

/* --- Fixtures ----------------------------------------------------------- */

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    projectId: "project-1",
    taskKey: "build_screens",
    stage: "development",
    status: "ready",
    estimatedMinutes: 600,
    actualMinutes: null,
    blockedMinutes: 0,
    startedAt: null,
    blockedAt: null,
    ...overrides,
  };
}

const developer = {
  user: { id: "staff-1", clerkUserId: "user_dev" },
  can: (permission: string) => permission === "build:execute",
} as never;

const customer = {
  user: { id: "user-1", clerkUserId: "user_abc" },
  can: () => false,
} as never;

beforeEach(() => {
  updates.length = 0;
  emitted.length = 0;
  updateMatches = true;
  taskRow = task();
  stageTasks = [{ status: "done" }];
  pendingTasks = [];
  unmetDependencies = [];
  pendingMilestones = [];
});

/* --- Authorization ------------------------------------------------------ */

describe("production tasks are staff-only", () => {
  const operations = [
    ["start", () => startTask("task-1", customer)],
    ["block", () => blockTask("task-1", "waiting", customer)],
    ["unblock", () => unblockTask("task-1", customer)],
    ["complete", () => completeTask("task-1", customer)],
    ["assign", () => assignTask("task-1", "staff-1", customer)],
  ] as const;

  it.each(operations)("%s is refused to a customer", async (_name, run) => {
    await expect(run()).rejects.toMatchObject({ code: "not_found" });
  });

  it("writes nothing when refused", async () => {
    await startTask("task-1", customer).catch(() => undefined);
    expect(updates).toHaveLength(0);
    expect(emitted).toHaveLength(0);
  });
});

/* --- Dependencies ------------------------------------------------------- */

describe("dependencies actually gate work", () => {
  it("refuses to start a task still waiting on another", async () => {
    // Otherwise the dependency graph is decoration.
    taskRow = task({ status: "pending" });

    await expect(startTask("task-1", developer)).rejects.toMatchObject({
      code: "conflict",
    });
    expect(updates).toHaveLength(0);
  });

  it("allows a ready task to start", async () => {
    const result = await startTask("task-1", developer);
    expect(result.status).toBe("in_progress");
    expect(emitted.map((event) => event.name)).toContain("task.started");
  });

  it("promotes dependents once their last dependency completes", async () => {
    taskRow = task({ status: "in_progress", startedAt: new Date() });
    pendingTasks = [{ id: "task-2" }, { id: "task-3" }];
    // task-3 still has something unfinished; task-2 does not.
    unmetDependencies = [{ taskId: "task-3" }];

    const { unlocked } = await completeTask("task-1", developer);

    expect(unlocked).toEqual(["task-2"]);
    expect(
      updates.some(
        (row) => row.table === "production_tasks" && row.values.status === "ready",
      ),
    ).toBe(true);
  });

  it("promotes nothing when every pending task still has a blocker", async () => {
    taskRow = task({ status: "in_progress", startedAt: new Date() });
    pendingTasks = [{ id: "task-2" }];
    unmetDependencies = [{ taskId: "task-2" }];

    const { unlocked } = await completeTask("task-1", developer);
    expect(unlocked).toEqual([]);
  });
});

/* --- Blocking ----------------------------------------------------------- */

describe("blocking", () => {
  it("requires a reason, because a blocked task with none cannot be unblocked", async () => {
    await expect(blockTask("task-1", "   ", developer)).rejects.toMatchObject({
      code: "bad_request",
    });
  });

  it("records when the block started", async () => {
    await blockTask("task-1", "waiting on an API key", developer);

    const update = updates.find((row) => row.table === "production_tasks");
    expect(update?.values.status).toBe("blocked");
    expect(update?.values.blockedAt).toBeInstanceOf(Date);
  });

  it("accumulates blocked time rather than replacing it", async () => {
    // A task blocked three times has lost all three periods.
    const blockedAt = new Date(Date.now() - 60 * 60 * 1000);
    taskRow = task({
      status: "blocked",
      startedAt: new Date(),
      blockedAt,
      blockedMinutes: 120,
    });

    await unblockTask("task-1", developer);

    const update = updates.find((row) => row.table === "production_tasks");
    expect(update?.values.blockedMinutes).toBeGreaterThanOrEqual(179);
    expect(update?.values.blockedMinutes).toBeLessThanOrEqual(181);
  });

  it("returns a started task to in_progress and an unstarted one to ready", async () => {
    taskRow = task({ status: "blocked", startedAt: new Date(), blockedAt: new Date() });
    await unblockTask("task-1", developer);
    expect(updates.at(-1)?.values.status).toBe("in_progress");

    updates.length = 0;
    taskRow = task({ status: "blocked", startedAt: null, blockedAt: new Date() });
    await unblockTask("task-1", developer);
    expect(updates.at(-1)?.values.status).toBe("ready");
  });

  it("refuses to unblock something that is not blocked", async () => {
    taskRow = task({ status: "in_progress" });
    await expect(unblockTask("task-1", developer)).rejects.toMatchObject({
      code: "conflict",
    });
  });
});

/* --- Durations ---------------------------------------------------------- */

describe("durations are measured, not entered", () => {
  it("computes the actual from the elapsed span", async () => {
    const startedAt = new Date(Date.now() - 120 * 60 * 1000);
    taskRow = task({ status: "in_progress", startedAt });

    await completeTask("task-1", developer);

    const update = updates.find((row) => row.table === "production_tasks");
    expect(update?.values.actualMinutes).toBeGreaterThanOrEqual(119);
    expect(update?.values.actualMinutes).toBeLessThanOrEqual(121);
  });

  it("deducts blocked time, so estimates calibrate against work not waiting", async () => {
    const startedAt = new Date(Date.now() - 180 * 60 * 1000);
    taskRow = task({ status: "in_progress", startedAt, blockedMinutes: 120 });

    await completeTask("task-1", developer);

    const update = updates.find((row) => row.table === "production_tasks");
    expect(update?.values.actualMinutes).toBeGreaterThanOrEqual(59);
    expect(update?.values.actualMinutes).toBeLessThanOrEqual(61);
  });

  it("never goes negative when blocked time exceeds the span", async () => {
    const startedAt = new Date(Date.now() - 10 * 60 * 1000);
    taskRow = task({ status: "in_progress", startedAt, blockedMinutes: 600 });

    await completeTask("task-1", developer);
    expect(
      updates.find((row) => row.table === "production_tasks")?.values.actualMinutes,
    ).toBe(0);
  });

  it("records no actual for a task completed without being started", async () => {
    // An invented duration is worse than an absent one.
    taskRow = task({ status: "ready", startedAt: null });
    await completeTask("task-1", developer);
    expect(
      updates.find((row) => row.table === "production_tasks")?.values.actualMinutes,
    ).toBeNull();
  });

  it("preserves the original start across a block and resume", async () => {
    const startedAt = new Date(Date.now() - 60 * 60 * 1000);
    taskRow = task({ status: "blocked", startedAt, blockedAt: new Date() });

    await startTask("task-1", developer);

    expect(
      updates.find((row) => row.table === "production_tasks")?.values.startedAt,
    ).toBe(startedAt);
  });

  it("reports estimate and actual together on completion", async () => {
    taskRow = task({ status: "in_progress", startedAt: new Date(Date.now() - 60_000) });
    await completeTask("task-1", developer);

    const event = emitted.find((entry) => entry.name === "task.completed");
    expect(event?.payload.estimatedMinutes).toBe(600);
    expect(event?.payload.actualMinutes).toBeTypeOf("number");
  });
});

/* --- Idempotence -------------------------------------------------------- */

describe("completing twice", () => {
  it("is a no-op rather than a second completion", async () => {
    taskRow = task({ status: "done" });
    const { unlocked } = await completeTask("task-1", developer);

    expect(unlocked).toEqual([]);
    expect(updates).toHaveLength(0);
    expect(emitted).toHaveLength(0);
  });

  it("refuses to complete a cancelled task", async () => {
    taskRow = task({ status: "cancelled" });
    await expect(completeTask("task-1", developer)).rejects.toMatchObject({
      code: "conflict",
    });
  });
});

/* --- Milestones --------------------------------------------------------- */

describe("milestones follow task state", () => {
  it("is reached when the last task in its stage completes", async () => {
    taskRow = task({ status: "in_progress", startedAt: new Date() });
    stageTasks = [{ status: "done" }, { status: "done" }];
    pendingMilestones = [{ id: "m1", key: "feature_complete" }];

    await completeTask("task-1", developer);

    expect(emitted.map((event) => event.name)).toContain("milestone.reached");
  });

  it("is not reached while work in the stage is still open", async () => {
    // A milestone must never claim a stage is finished while it is not.
    taskRow = task({ status: "in_progress", startedAt: new Date() });
    stageTasks = [{ status: "done" }, { status: "in_progress" }];
    pendingMilestones = [{ id: "m1", key: "feature_complete" }];

    await completeTask("task-1", developer);

    expect(emitted.map((event) => event.name)).not.toContain("milestone.reached");
  });

  it("emits once when two completions race", async () => {
    taskRow = task({ status: "in_progress", startedAt: new Date() });
    stageTasks = [{ status: "done" }];
    pendingMilestones = [{ id: "m1", key: "feature_complete" }];
    // The conditional UPDATE matches nothing: another caller got there first.
    updateMatches = false;

    await completeTask("task-1", developer).catch(() => undefined);

    expect(emitted.filter((event) => event.name === "milestone.reached")).toHaveLength(0);
  });
});
