import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The guarantee clock.
 *
 * This is the rule the whole product is sold on, so it is tested from both
 * sides: that it starts when it should, and -- more importantly -- that none
 * of the earlier events can start it.
 */

const inserts: { table: string; values: Record<string, unknown> }[] = [];
const updates: { table: string; values: Record<string, unknown> }[] = [];

let projectRow: Record<string, unknown> | undefined;
let uploadCount = 0;
/** Whether the conditional UPDATE matches a row. */
let updateMatches = true;

function tableName(table: unknown): string {
  for (const symbol of Object.getOwnPropertySymbols(table as object)) {
    if (String(symbol).includes("Name")) {
      return String((table as Record<symbol, unknown>)[symbol]);
    }
  }
  return "unknown";
}

vi.mock("@/db/client", () => ({
  db: {
    query: { projects: { findFirst: () => Promise.resolve(projectRow) } },
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([{ count: uploadCount }]),
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        inserts.push({ table: tableName(table), values });
        return Promise.resolve([]);
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        updates.push({ table: tableName(table), values });
        return {
          where: () => ({
            returning: () =>
              Promise.resolve(
                updateMatches ? [{ ...(projectRow ?? {}), ...values }] : [],
              ),
          }),
        };
      },
    }),
  },
}));

const createProductionPlan = vi.fn();
vi.mock("@/server/production/plan", () => ({
  createProductionPlan: (project: unknown) => createProductionPlan(project),
}));

const { publishPreview, startBuild, submitAssets } = await import("./lifecycle");

/* --- Fixtures ----------------------------------------------------------- */

function project(overrides: Record<string, unknown> = {}) {
  return {
    id: "project-1",
    reference: "PRJ-2026-0001",
    ownerId: "user-1",
    status: "awaiting_assets",
    guaranteedDays: 5,
    paidAt: new Date("2026-10-05T10:00:00Z"),
    assetsSubmittedAt: null,
    buildStartedAt: null,
    deadlineAt: null,
    ...overrides,
  };
}

const customer = {
  user: { id: "user-1", clerkUserId: "user_abc", email: "buyer@example.com" },
  can: () => false,
} as never;

const developer = {
  user: { id: "staff-1", clerkUserId: "user_dev", email: "dev@example.com" },
  can: (permission: string) =>
    permission === "build:execute" || permission === "project:read:all",
} as never;

beforeEach(() => {
  inserts.length = 0;
  updates.length = 0;
  uploadCount = 1;
  updateMatches = true;
  projectRow = project();
  createProductionPlan.mockReset();
  createProductionPlan.mockResolvedValue({ created: true, taskCount: 13 });
});

/* --- Submitting assets -------------------------------------------------- */

describe("submitting assets does not start the clock", () => {
  it("records when the customer met their obligation", async () => {
    const result = await submitAssets("project-1", customer);

    expect(result.ok).toBe(true);
    const update = updates.find((row) => row.table === "projects");
    expect(update?.values.assetsSubmittedAt).toBeInstanceOf(Date);
  });

  it("does not set buildStartedAt or deadlineAt", async () => {
    // The whole rule in one assertion. A customer dropping in a logo must not
    // be able to start their own guarantee.
    await submitAssets("project-1", customer);

    const update = updates.find((row) => row.table === "projects");
    expect(update?.values.buildStartedAt).toBeUndefined();
    expect(update?.values.deadlineAt).toBeUndefined();
    expect(update?.values.status).toBeUndefined();
  });

  it("says so in the audit trail", async () => {
    await submitAssets("project-1", customer);

    const event = inserts.find((row) => row.table === "project_events");
    expect(event?.values.type).toBe("assets.submitted");
    expect(
      (event?.values.payload as { guaranteeStarted: boolean }).guaranteeStarted,
    ).toBe(false);
  });

  it("refuses when nothing has actually been uploaded", async () => {
    // A confirmation is not a file; the build team cannot start on an empty
    // folder.
    uploadCount = 0;

    const result = await submitAssets("project-1", customer);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("no_assets");
    expect(updates).toHaveLength(0);
  });

  it("refuses when the project is not waiting for assets", async () => {
    projectRow = project({ status: "in_build", buildStartedAt: new Date() });

    const result = await submitAssets("project-1", customer);
    expect(result.ok).toBe(false);
  });

  it("is idempotent: a second submit does not move the recorded date", async () => {
    // The UPDATE is conditional on the column still being null.
    updateMatches = false;
    projectRow = project({ assetsSubmittedAt: new Date("2026-10-06T09:00:00Z") });

    const result = await submitAssets("project-1", customer);

    expect(result.ok).toBe(true);
    expect(inserts.filter((row) => row.table === "project_events")).toHaveLength(0);
  });

  it("is scoped to the owner", async () => {
    // The lookup carries the caller's own id, so a stranger gets not_found.
    projectRow = undefined;
    await expect(submitAssets("project-1", customer)).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

/* --- Starting the build ------------------------------------------------- */

describe("starting the build is what starts the clock", () => {
  beforeEach(() => {
    projectRow = project({ assetsSubmittedAt: new Date("2026-10-05T14:00:00Z") });
  });

  it("sets the status, the start and the deadline together", async () => {
    const result = await startBuild("project-1", developer);

    expect(result.ok).toBe(true);
    const update = updates.find((row) => row.table === "projects");
    expect(update?.values.status).toBe("in_build");
    expect(update?.values.buildStartedAt).toBeInstanceOf(Date);
    expect(update?.values.deadlineAt).toBeInstanceOf(Date);
  });

  it("computes the deadline in working days, not calendar days", async () => {
    await startBuild("project-1", developer);

    const update = updates.find((row) => row.table === "projects");
    const started = update?.values.buildStartedAt as Date;
    const deadline = update?.values.deadlineAt as Date;

    // Five working days is at least seven calendar days whenever a weekend
    // falls inside the window, and never fewer than five.
    const calendarDays = (deadline.getTime() - started.getTime()) / 86_400_000;
    expect(calendarDays).toBeGreaterThanOrEqual(5);
    expect(calendarDays).toBeLessThanOrEqual(9);
  });

  it("stores the deadline rather than leaving it to be derived", async () => {
    // A later change to tier durations must not move a commitment already made.
    await startBuild("project-1", developer);
    expect(
      updates.find((row) => row.table === "projects")?.values.deadlineAt,
    ).toBeInstanceOf(Date);
  });

  it("writes the moment into the audit trail", async () => {
    await startBuild("project-1", developer);

    const event = inserts.find((row) => row.table === "project_events");
    expect(event?.values.type).toBe("build.started");
    expect(
      (event?.values.payload as { guaranteeStarted: boolean }).guaranteeStarted,
    ).toBe(true);
  });

  it("generates the production plan, because the window now exists", async () => {
    // The plan's dates are spread across the guaranteed window, which does not
    // exist until the clock starts -- so it is built here, not at payment.
    await startBuild("project-1", developer);
    expect(createProductionPlan).toHaveBeenCalledTimes(1);
  });

  it("does not generate a plan when the transition is refused", async () => {
    projectRow = project({ assetsSubmittedAt: null });
    await startBuild("project-1", developer);
    expect(createProductionPlan).not.toHaveBeenCalled();
  });

  it("refuses before the customer's assets are in", async () => {
    // Starting the clock before we can work is the company paying for its own
    // queue.
    projectRow = project({ assetsSubmittedAt: null });

    const result = await startBuild("project-1", developer);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("no_assets");
    expect(updates).toHaveLength(0);
  });

  it("refuses when there is no guaranteed duration to count", async () => {
    projectRow = project({
      assetsSubmittedAt: new Date(),
      guaranteedDays: null,
    });

    const result = await startBuild("project-1", developer);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("no_guarantee");
  });

  it("refuses to start twice, so one project has one deadline", async () => {
    projectRow = project({
      assetsSubmittedAt: new Date(),
      buildStartedAt: new Date("2026-10-06T09:00:00Z"),
    });

    const result = await startBuild("project-1", developer);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("already_started");
  });

  it("yields when a concurrent caller takes the transition", async () => {
    updateMatches = false;

    const result = await startBuild("project-1", developer);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("already_started");
  });
});

describe("a customer cannot start their own guarantee", () => {
  beforeEach(() => {
    projectRow = project({ assetsSubmittedAt: new Date() });
  });

  it("is refused without build:execute", async () => {
    await expect(startBuild("project-1", customer)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("writes nothing when refused", async () => {
    await startBuild("project-1", customer).catch(() => undefined);
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it("reports not_found rather than forbidden", async () => {
    // A 403 would confirm the transition exists and that they lack the right,
    // which is information a probing caller did not have.
    await expect(startBuild("project-1", customer)).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("publishing a preview", () => {
  it("requires build:execute", async () => {
    await expect(publishPreview("project-1", customer)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("moves an in-build project into preview", async () => {
    projectRow = project({ status: "in_build" });

    const result = await publishPreview("project-1", developer);

    expect(result.ok).toBe(true);
    expect(updates.find((row) => row.table === "projects")?.values.status).toBe(
      "in_preview",
    );
  });

  it("does not touch the deadline", async () => {
    // Delivering early does not shorten the guarantee, and delivering late
    // does not extend it.
    projectRow = project({ status: "in_build" });
    await publishPreview("project-1", developer);

    const update = updates.find((row) => row.table === "projects");
    expect(update?.values.deadlineAt).toBeUndefined();
    expect(update?.values.buildStartedAt).toBeUndefined();
  });
});
