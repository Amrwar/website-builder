import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The event bus.
 *
 * This is the contract future automation reads against, so the properties
 * tested here are the ones a consumer will depend on: the fact is recorded
 * before anyone is notified, a broken subscriber cannot damage the emitter,
 * and the one event that starts a guarantee cannot be raised by a customer.
 */

const inserted: Record<string, unknown>[] = [];
let insertThrows = false;

vi.mock("@/db/client", () => ({
  db: {
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        if (insertThrows) return Promise.reject(new Error("db down"));
        inserted.push(values);
        return Promise.resolve([]);
      },
    }),
  },
}));

const loggedErrors: unknown[] = [];
vi.mock("@/lib/logger", () => ({
  logger: {
    error: (...args: unknown[]) => loggedErrors.push(args),
    warn: () => undefined,
    info: () => undefined,
    debug: () => undefined,
    child: () => ({
      error: () => undefined,
      warn: () => undefined,
      info: () => undefined,
      debug: () => undefined,
    }),
  },
}));

const { emit, resetSubscribers, subscribe, subscriberCount } = await import("./bus");

beforeEach(() => {
  inserted.length = 0;
  loggedErrors.length = 0;
  insertThrows = false;
  resetSubscribers();
});

describe("recording", () => {
  it("writes the event to the audit trail", async () => {
    await emit({
      name: "task.started",
      projectId: "project-1",
      actorType: "staff",
      actorId: "user_dev",
      payload: { taskId: "t1", taskKey: "scaffold" },
    });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.type).toBe("task.started");
    expect(inserted[0]?.projectId).toBe("project-1");
  });

  it("stamps the payload version, so a consumer knows what it is reading", async () => {
    await emit({
      name: "task.started",
      projectId: "project-1",
      actorType: "staff",
      payload: { taskId: "t1", taskKey: "scaffold" },
    });

    expect((inserted[0]?.payload as { v: number }).v).toBe(1);
  });

  it("returns the event envelope to the caller", async () => {
    const event = await emit({
      name: "milestone.reached",
      projectId: "project-1",
      actorType: "system",
      payload: { milestoneId: "m1", milestoneKey: "design_ready" },
    });

    expect(event.name).toBe("milestone.reached");
    expect(event.occurredAt).toBeInstanceOf(Date);
    expect(event.version).toBe(1);
  });
});

describe("subscribers", () => {
  it("are notified after the fact is recorded, not before", async () => {
    const order: string[] = [];
    subscribe("task.completed", "orderProbe", async () => {
      // By the time a handler runs, the row already exists.
      order.push(`handler saw ${inserted.length} row(s)`);
    });

    await emit({
      name: "task.completed",
      projectId: "project-1",
      actorType: "staff",
      payload: { taskId: "t1", taskKey: "x", estimatedMinutes: 60, actualMinutes: 45 },
    });

    expect(order).toEqual(["handler saw 1 row(s)"]);
  });

  it("receive the typed payload", async () => {
    const seen: unknown[] = [];
    subscribe("task.blocked", "probe", async (event) => {
      seen.push(event.payload.reason);
    });

    await emit({
      name: "task.blocked",
      projectId: "project-1",
      actorType: "staff",
      payload: { taskId: "t1", taskKey: "x", reason: "waiting on API key" },
    });

    expect(seen).toEqual(["waiting on API key"]);
  });

  it("only hear the event they subscribed to", async () => {
    const calls: string[] = [];
    subscribe("task.started", "a", async () => void calls.push("a"));
    subscribe("task.completed", "b", async () => void calls.push("b"));

    await emit({
      name: "task.started",
      projectId: "project-1",
      actorType: "staff",
      payload: { taskId: "t1", taskKey: "x" },
    });

    expect(calls).toEqual(["a"]);
  });

  it("can be several on one event", async () => {
    subscribe("stage.entered", "one", async () => undefined);
    subscribe("stage.entered", "two", async () => undefined);
    expect(subscriberCount("stage.entered")).toBe(2);
  });
});

describe("a broken subscriber", () => {
  it("does not fail the emitter", async () => {
    // Adding a subscriber must never put the core workflow at risk.
    subscribe("task.started", "exploding", async () => {
      throw new Error("handler blew up");
    });

    await expect(
      emit({
        name: "task.started",
        projectId: "project-1",
        actorType: "staff",
        payload: { taskId: "t1", taskKey: "x" },
      }),
    ).resolves.toBeDefined();
  });

  it("is logged by name, so it can be found", async () => {
    subscribe("task.started", "exploding", async () => {
      throw new Error("handler blew up");
    });

    await emit({
      name: "task.started",
      projectId: "project-1",
      actorType: "staff",
      payload: { taskId: "t1", taskKey: "x" },
    });

    expect(JSON.stringify(loggedErrors)).toContain("exploding");
  });

  it("does not stop the subscribers after it", async () => {
    const calls: string[] = [];
    subscribe("task.started", "first", async () => {
      throw new Error("nope");
    });
    subscribe("task.started", "second", async () => void calls.push("second"));

    await emit({
      name: "task.started",
      projectId: "project-1",
      actorType: "staff",
      payload: { taskId: "t1", taskKey: "x" },
    });

    expect(calls).toEqual(["second"]);
  });
});

describe("privileged events", () => {
  it("cannot be emitted with a customer actor", async () => {
    // A code path that let a customer emit build.started would be letting them
    // start their own guarantee.
    await expect(
      emit({
        name: "build.started",
        projectId: "project-1",
        actorType: "customer",
        payload: {
          guaranteedDays: 5,
          startedAt: new Date().toISOString(),
          deadlineAt: null,
          guaranteeStarted: true,
        },
      }),
    ).rejects.toThrow(/customer actor/);
  });

  it("record nothing when refused", async () => {
    await emit({
      name: "deadline.missed",
      projectId: "project-1",
      actorType: "customer",
      payload: {
        deadlineAt: new Date().toISOString(),
        detectedAt: new Date().toISOString(),
        workingDaysOverdue: 1,
      },
    }).catch(() => undefined);

    expect(inserted).toHaveLength(0);
  });

  it("are allowed from staff and from the system", async () => {
    await expect(
      emit({
        name: "build.started",
        projectId: "project-1",
        actorType: "staff",
        payload: {
          guaranteedDays: 5,
          startedAt: new Date().toISOString(),
          deadlineAt: null,
          guaranteeStarted: true,
        },
      }),
    ).resolves.toBeDefined();
  });

  it("leave ordinary events reachable by customers", async () => {
    await expect(
      emit({
        name: "message.posted",
        projectId: "project-1",
        actorType: "customer",
        payload: { messageId: "m1", attachments: 0 },
      }),
    ).resolves.toBeDefined();
  });
});

describe("when the audit write fails", () => {
  it("the emit fails rather than silently notifying subscribers", async () => {
    // The audit trail is the product of record. Notifying handlers about
    // something we failed to record would leave the two permanently disagreeing.
    const calls: string[] = [];
    subscribe("task.started", "probe", async () => void calls.push("called"));
    insertThrows = true;

    await expect(
      emit({
        name: "task.started",
        projectId: "project-1",
        actorType: "staff",
        payload: { taskId: "t1", taskKey: "x" },
      }),
    ).rejects.toThrow();

    expect(calls).toEqual([]);
  });
});
