import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Who may do what inside a Build Room.
 *
 * Written from the attacker's side. A project is a commercial relationship
 * between one customer and our team, so the questions that matter are: can a
 * stranger reach it, can a customer act as staff, and can staff act as the
 * customer.
 */

const inserts: { table: string; values: Record<string, unknown> }[] = [];
const updates: { table: string; values: Record<string, unknown> }[] = [];

let projectRow: Record<string, unknown> | undefined;
let changeRow: Record<string, unknown> | undefined;
let approvalRow: Record<string, unknown> | undefined;
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
    query: {
      projects: { findFirst: () => Promise.resolve(projectRow) },
      changeRequests: { findFirst: () => Promise.resolve(changeRow) },
      projectApprovals: { findFirst: () => Promise.resolve(approvalRow) },
    },
    select: () => ({
      from: () => ({ where: () => Promise.resolve([{ count: 0, rounds: 0 }]) }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        inserts.push({ table: tableName(table), values });
        const rows = [{ id: `${tableName(table)}-id`, ...values }];
        return {
          then: (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve),
          returning: () => Promise.resolve(rows),
        };
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        updates.push({ table: tableName(table), values });
        return {
          where: () => ({
            then: (resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve),
            returning: () =>
              Promise.resolve(updateMatches ? [{ id: "row", ...values }] : []),
          }),
        };
      },
    }),
  },
}));

const {
  assertParticipant,
  decideApproval,
  decideChangeRequest,
  requestApproval,
  requestChange,
  sendMessage,
} = await import("./collaboration");

/* --- Fixtures ----------------------------------------------------------- */

function project(overrides: Record<string, unknown> = {}) {
  return { id: "project-1", reference: "PRJ-2026-0001", ownerId: "user-1", ...overrides };
}

const owner = {
  user: {
    id: "user-1",
    clerkUserId: "user_abc",
    email: "buyer@example.com",
    displayName: "Buyer",
  },
  can: () => false,
} as never;

const staff = {
  user: {
    id: "staff-1",
    clerkUserId: "user_pm",
    email: "pm@example.com",
    displayName: "PM",
  },
  can: (permission: string) =>
    permission === "project:read:all" || permission === "project:manage",
} as never;

beforeEach(() => {
  inserts.length = 0;
  updates.length = 0;
  updateMatches = true;
  projectRow = project();
  changeRow = undefined;
  approvalRow = undefined;
});

/* --- Participation ------------------------------------------------------ */

describe("reaching a project at all", () => {
  it("lets the owner in", async () => {
    const participant = await assertParticipant("project-1", owner);
    expect(participant.isOwner).toBe(true);
    expect(participant.isStaff).toBe(false);
  });

  it("lets staff with project:read:all in", async () => {
    const participant = await assertParticipant("project-1", staff);
    expect(participant.isStaff).toBe(true);
    expect(participant.isOwner).toBe(false);
  });

  it("answers not_found to a stranger", async () => {
    // The customer lookup is scoped to their own id, so someone else's project
    // simply does not exist as far as they are concerned.
    projectRow = undefined;
    await expect(assertParticipant("project-1", owner)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("never answers forbidden, which would confirm the project is real", async () => {
    projectRow = undefined;
    const error = await assertParticipant("project-1", owner).catch((e: unknown) => e);
    expect((error as { code: string }).code).not.toBe("forbidden");
  });
});

/* --- Messages ----------------------------------------------------------- */

describe("messages", () => {
  it("records who wrote it and in what capacity", async () => {
    await sendMessage("project-1", "Hello", owner);

    const message = inserts.find((row) => row.table === "project_messages");
    expect(message?.values.authorType).toBe("customer");
    expect(message?.values.authorName).toBe("Buyer");
  });

  it("marks staff messages as staff", async () => {
    await sendMessage("project-1", "On it", staff);
    expect(
      inserts.find((row) => row.table === "project_messages")?.values.authorType,
    ).toBe("staff");
  });

  it("refuses an empty message", async () => {
    await expect(sendMessage("project-1", "   ", owner)).rejects.toMatchObject({
      code: "bad_request",
    });
    expect(inserts).toHaveLength(0);
  });

  it("refuses an oversized message", async () => {
    await expect(sendMessage("project-1", "x".repeat(5001), owner)).rejects.toMatchObject(
      { code: "bad_request" },
    );
  });

  it("is refused to a stranger before anything is written", async () => {
    projectRow = undefined;
    await expect(sendMessage("project-1", "Hello", owner)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(inserts).toHaveLength(0);
  });

  it("appears on the activity feed", async () => {
    await sendMessage("project-1", "Hello", owner);
    expect(inserts.find((row) => row.table === "project_events")?.values.type).toBe(
      "message.posted",
    );
  });
});

/* --- Change requests ---------------------------------------------------- */

describe("change requests", () => {
  it("opens with no price or scope impact set", async () => {
    // A customer naming their own price impact is a negotiation, not a change
    // request. Impact is assessed by us.
    await requestChange(
      "project-1",
      { title: "Add a booking form", description: "We want online bookings." },
      owner,
    );

    const created = inserts.find((row) => row.table === "change_requests");
    expect(created?.values.status).toBe("submitted");
    expect(created?.values.priceImpactMinorUnits).toBeUndefined();
    expect(created?.values.additionalDays).toBeUndefined();
  });

  it("refuses an empty title or description", async () => {
    await expect(
      requestChange("project-1", { title: "", description: "x" }, owner),
    ).rejects.toMatchObject({ code: "bad_request" });
  });

  it("is refused to a stranger", async () => {
    projectRow = undefined;
    await expect(
      requestChange("project-1", { title: "a", description: "b" }, owner),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("stops a customer accepting a change that has not been quoted", async () => {
    // Accepting an unquoted change would commit us to work at an unknown
    // price, which is the exact failure the scope model exists to prevent.
    changeRow = { id: "cr-1", projectId: "project-1", status: "submitted" };

    await expect(decideChangeRequest("cr-1", "approved", owner)).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("lets a customer accept one that has been quoted", async () => {
    changeRow = { id: "cr-1", projectId: "project-1", status: "quoted" };

    const result = await decideChangeRequest("cr-1", "approved", owner);
    expect(result).toBeDefined();
    expect(updates.some((row) => row.table === "change_requests")).toBe(true);
  });

  it("records the decision on the activity feed with its impact", async () => {
    changeRow = {
      id: "cr-1",
      projectId: "project-1",
      status: "quoted",
      reference: "CR-1",
      priceImpactMinorUnits: 15_000,
      additionalDays: 3,
    };

    await decideChangeRequest("cr-1", "approved", owner);

    const event = inserts.find((row) => row.table === "project_events");
    expect(event?.values.type).toBe("change.approved");
    expect(
      (event?.values.payload as { priceImpactMinorUnits: number }).priceImpactMinorUnits,
    ).toBe(15_000);
  });
});

/* --- Approvals ---------------------------------------------------------- */

describe("approvals", () => {
  it("can only be requested by staff", async () => {
    await expect(requestApproval("project-1", "design", owner)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("opens a new round rather than reopening the last one", async () => {
    await requestApproval("project-1", "design", staff);

    const created = inserts.find((row) => row.table === "project_approvals");
    expect(created?.values.round).toBe(1);
    expect(created?.values.status).toBe("pending");
  });

  it("can only be decided by the owner", async () => {
    // Staff approving on a customer's behalf would make every approval on the
    // timeline worthless as evidence.
    approvalRow = {
      id: "ap-1",
      projectId: "project-1",
      kind: "design",
      status: "pending",
    };

    await expect(decideApproval("ap-1", "approved", staff)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("is recorded when the owner approves", async () => {
    approvalRow = {
      id: "ap-1",
      projectId: "project-1",
      kind: "design",
      status: "pending",
      round: 1,
    };

    await decideApproval("ap-1", "approved", owner);

    expect(updates.find((row) => row.table === "project_approvals")?.values.status).toBe(
      "approved",
    );
    expect(inserts.find((row) => row.table === "project_events")?.values.type).toBe(
      "approval.design.approved",
    );
  });

  it("refuses to decide one that is already decided", async () => {
    approvalRow = {
      id: "ap-1",
      projectId: "project-1",
      kind: "design",
      status: "approved",
    };

    await expect(decideApproval("ap-1", "approved", owner)).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("produces one decision from two concurrent taps", async () => {
    // The UPDATE is conditional on the row still being pending.
    approvalRow = {
      id: "ap-1",
      projectId: "project-1",
      kind: "design",
      status: "pending",
    };
    updateMatches = false;

    await expect(decideApproval("ap-1", "approved", owner)).rejects.toMatchObject({
      code: "conflict",
    });
  });
});
